import type { Message } from '../lib/messages';

const SIDEPANEL_PATH = 'src/sidepanel/index.html';

// Tracks tabs that currently have the panel open so the action button toggles correctly
const openedTabs = new Set<number>();

let sidePanelPort: chrome.runtime.Port | null = null;

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
    chrome.sidePanel
      .setOptions({ tabId, enabled: true, path: SIDEPANEL_PATH })
      .then(() => chrome.sidePanel.open({ tabId }))
      .catch(console.error);
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') return;
  sidePanelPort = port;

  // Capture the active tab at connect time. When the port later disconnects
  // (user pressed X to close the panel), remove the tab from openedTabs so
  // the next action click re-opens rather than double-toggling to close.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    port.onDisconnect.addListener(() => {
      sidePanelPort = null;
      if (tabId != null) openedTabs.delete(tabId);
    });
  });
});

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  openedTabs.delete(tabId);
});

// Relay messages between content script and side panel
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === 'EXTRACT_TEXT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id != null) {
        chrome.tabs.sendMessage(activeTab.id, message, (response) => {
          sendResponse(response);
        });
      }
    });
    return true;
  }

  if (
    message.type === 'ELEMENT_HOVERED' ||
    message.type === 'ELEMENT_CLICKED' ||
    message.type === 'NEW_TEXT_BLOCKS' ||
    message.type === 'TEXT_UPDATED'
  ) {
    if (sidePanelPort) {
      sidePanelPort.postMessage(message);
    }
    return false;
  }

  if (message.type === 'HIGHLIGHT_ELEMENT' || message.type === 'UNHIGHLIGHT_ELEMENT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id != null) {
        chrome.tabs.sendMessage(activeTab.id, message);
      }
    });
    return false;
  }

  if (tabId != null && message.type === 'PAGE_TEXT') {
    if (sidePanelPort) {
      sidePanelPort.postMessage(message);
    }
  }

  return false;
});
