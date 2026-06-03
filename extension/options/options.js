async function init() {
  const input = document.getElementById('backendUrl');
  const { backendUrl = 'http://127.0.0.1:3000' } = await chrome.storage.sync.get('backendUrl');
  input.value = backendUrl;

  document.getElementById('save').addEventListener('click', async () => {
    const value = input.value.trim().replace(/\/+$/, '');
    if (!value) return;
    await chrome.storage.sync.set({ backendUrl: value });
    const ok = document.getElementById('ok');
    ok.hidden = false;
    setTimeout(() => (ok.hidden = true), 1500);
  });
}
init();
