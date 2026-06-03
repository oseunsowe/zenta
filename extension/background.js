// Service worker: handle hotkey, manage side panel, store backend URL.

const DEFAULT_BACKEND = 'http://127.0.0.1:3000';

chrome.runtime.onInstalled.addListener(async () => {
  const { backendUrl } = await chrome.storage.sync.get('backendUrl');
  if (!backendUrl) {
    await chrome.storage.sync.set({ backendUrl: DEFAULT_BACKEND });
  }
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch {}
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-helper') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (err) {
    console.debug('side panel open failed', err);
  }
});
