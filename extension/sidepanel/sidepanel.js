async function init() {
  const { backendUrl } = await chrome.storage.sync.get('backendUrl');
  const frame = document.getElementById('panel');
  const empty = document.getElementById('empty');
  if (!backendUrl) {
    frame.style.display = 'none';
    empty.style.display = 'block';
    document.getElementById('open-options').addEventListener('click', (event) => {
      event.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    return;
  }
  frame.src = backendUrl;
}
init();
