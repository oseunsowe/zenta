async function init() {
  const { backendUrl = 'http://127.0.0.1:3000' } = await chrome.storage.sync.get('backendUrl');
  document.getElementById('backend-url').textContent = backendUrl;
  document.getElementById('view-link').href = `${backendUrl}/view`;
  document.getElementById('pair-link').href = `${backendUrl}/pair`;

  document.getElementById('open-panel').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
        window.close();
      } catch (err) {
        alert('Could not open side panel: ' + err);
      }
    }
  });

  document.getElementById('open-window').addEventListener('click', async () => {
    await chrome.windows.create({
      url: backendUrl,
      type: 'popup',
      width: 1100,
      height: 800,
    });
    window.close();
  });

  document.getElementById('options-link').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

init();
