import type { Message } from '../lib/messages';
import { isMessage } from '../lib/messages';

const SIDEPANEL_PATH = 'src/sidepanel/index.html';

// Tracks tabs that currently have the panel open so the action button toggles correctly
const openedTabs = new Set<number>();

// Map from tab ID → the sidepanel port monitoring that tab (supports multiple windows)
const tabPorts = new Map<number, chrome.runtime.Port>();

/**
 * Safely send a message through a port with error handling.
 * If the port is disconnected, cleans up the port from tabPorts.
 */
function safePostMessage(port: chrome.runtime.Port, tabId: number, message: Message): boolean {
  try {
    port.postMessage(message);
    return true;
  } catch (error) {
    console.error(`[background] Failed to send message to sidepanel for tab ${tabId}:`, error);
    // Port is likely disconnected, clean up
    tabPorts.delete(tabId);
    openedTabs.delete(tabId);
    return false;
  }
}

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

  // Listen for the sidepanel to send its tab ID
  port.onMessage.addListener((message: unknown) => {
    // Validate message before processing
    if (!isMessage(message)) {
      console.warn('[background] Received invalid message from sidepanel:', message);
      return;
    }

    if (message.type === 'SIDEPANEL_READY') {
      const tabId = message.tabId;
      if (tabId == null) return;

      tabPorts.set(tabId, port);

      port.onDisconnect.addListener(() => {
        tabPorts.delete(tabId);
        openedTabs.delete(tabId);
      });
    }
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
      safePostMessage(port, tabId, { type: 'PAGE_REFRESHED' });
    }
  }
});

// Relay messages between content script and side panel
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Validate that message has proper structure
  if (!isMessage(message)) {
    console.warn('[background] Received invalid message:', message);
    return false;
  }

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
          console.error('[background] Failed to send EXTRACT_TEXT to content script:', chrome.runtime.lastError.message);
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
    message.type === 'TEXT_UPDATED' ||
    message.type === 'MODE_CHANGED'
  ) {
    // Only forward to the sidepanel port associated with this specific tab
    if (senderTabId != null) {
      const port = tabPorts.get(senderTabId);
      if (port) {
        safePostMessage(port, senderTabId, message);
      }
    }
    return false;
  }

  if (message.type === 'HIGHLIGHT_ELEMENT' || message.type === 'UNHIGHLIGHT_ELEMENT' || message.type === 'SCROLL_TO_ELEMENT' || message.type === 'BLOCK_INTERACTIVE_CHANGED' || message.type === 'SET_MODE') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id != null) {
        chrome.tabs.sendMessage(activeTab.id, message, () => {
          if (chrome.runtime.lastError) {
            console.error('[background] Failed to send message to content script:', chrome.runtime.lastError.message);
          }
        });
      }
    });
    return false;
  }

  if (senderTabId != null && message.type === 'PAGE_TEXT') {
    const port = tabPorts.get(senderTabId);
    if (port) {
      safePostMessage(port, senderTabId, message);
    }
  }

  return false;
});
