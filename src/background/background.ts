import type { Message } from '../lib/messages';

// Open sidebar when the toolbar icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Track the side panel port so we can forward messages to it
let sidePanelPort: chrome.runtime.Port | null = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel') {
    sidePanelPort = port;
    port.onDisconnect.addListener(() => {
      sidePanelPort = null;
    });
  }
});

// Relay messages between content script and side panel
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === 'EXTRACT_TEXT') {
    // Forwarded from side panel to the active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id != null) {
        chrome.tabs.sendMessage(activeTab.id, message, (response) => {
          sendResponse(response);
        });
      }
    });
    return true; // Keep channel open for async response
  }

  if (
    message.type === 'ELEMENT_HOVERED' ||
    message.type === 'ELEMENT_CLICKED' ||
    message.type === 'NEW_TEXT_BLOCKS' ||
    message.type === 'TEXT_UPDATED'
  ) {
    // Forward from content script → side panel
    if (sidePanelPort) {
      sidePanelPort.postMessage(message);
    }
    return false;
  }

  if (message.type === 'HIGHLIGHT_ELEMENT' || message.type === 'UNHIGHLIGHT_ELEMENT') {
    // Forward from side panel → content script (active tab)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id != null) {
        chrome.tabs.sendMessage(activeTab.id, message);
      }
    });
    return false;
  }

  if (tabId != null && (message.type === 'PAGE_TEXT')) {
    // Already handled via sendResponse pattern above; this path handles if content script
    // sends PAGE_TEXT independently (not used currently but kept for extensibility)
    if (sidePanelPort) {
      sidePanelPort.postMessage(message);
    }
  }

  return false;
});
