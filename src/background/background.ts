import type { Message } from '../lib/messages';

const SIDEPANEL_PATH = 'src/sidepanel/index.html';

// Tracks tabs that currently have the panel open so the action button toggles correctly
const openedTabs = new Set<number>();

// Map from tab ID → the sidepanel port monitoring that tab (supports multiple windows)
const tabPorts = new Map<number, chrome.runtime.Port>();

// We handle the action click ourselves to get per-tab, toggle behaviour
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) return;
  const tabId = tab.id;

  if (openedTabs.has(tabId)) {
    // Panel is open → close it
    openedTabs.delete(tabId);
    chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(console.error);
  } else {
    // Panel is closed → open it for this specific tab
    openedTabs.add(tabId);
    // Both calls must stay in the same synchronous tick so open() is still
    // within the user-gesture context. Chaining with .then() loses it.
    chrome.sidePanel.setOptions({ tabId, enabled: true, path: SIDEPANEL_PATH }).catch(console.error);
    chrome.sidePanel.open({ tabId }).catch(console.error);
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') return;

  // Capture the active tab at connect time. When the port later disconnects
  // (user pressed X to close the panel), remove the tab from openedTabs so
  // the next action click re-opens rather than double-toggling to close.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId == null) return;

    tabPorts.set(tabId, port);

    port.onDisconnect.addListener(() => {
      tabPorts.delete(tabId);
      openedTabs.delete(tabId);
    });
  });
});

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  openedTabs.delete(tabId);
  tabPorts.delete(tabId);
});

// Notify sidebar when a tab is refreshed (navigated to same URL or reloaded)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    const port = tabPorts.get(tabId);
    if (port) {
      port.postMessage({ type: 'PAGE_REFRESHED' } as Message);
    }
  }
});

// Relay messages between content script and side panel
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const senderTabId = sender.tab?.id;

  if (message.type === 'EXTRACT_TEXT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id == null) {
        sendResponse(null);
        return;
      }
      chrome.tabs.sendMessage(activeTab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse(null);
          return;
        }
        sendResponse(response);
      });
    });
    return true;
  }

  if (
    message.type === 'ELEMENT_HOVERED' ||
    message.type === 'ELEMENT_CLICKED' ||
    message.type === 'NEW_TEXT_BLOCKS' ||
    message.type === 'TEXT_UPDATED'
  ) {
    // Only forward to the sidepanel port associated with this specific tab
    if (senderTabId != null) {
      const port = tabPorts.get(senderTabId);
      if (port) port.postMessage(message);
    }
    return false;
  }

  if (message.type === 'HIGHLIGHT_ELEMENT' || message.type === 'UNHIGHLIGHT_ELEMENT' || message.type === 'SCROLL_TO_ELEMENT' || message.type === 'SET_MODE') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id != null) {
        chrome.tabs.sendMessage(activeTab.id, message, () => {
          void chrome.runtime.lastError; // acknowledge to suppress unchecked warning
        });
      }
    });
    return false;
  }

  if (senderTabId != null && message.type === 'PAGE_TEXT') {
    const port = tabPorts.get(senderTabId);
    if (port) port.postMessage(message);
  }

  return false;
});
