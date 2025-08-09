async function clip() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result: selection }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString(),
  });
  await fetch('http://localhost:3000/api/clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: tab.title, url: tab.url, content: selection })
  });
  window.close();
}

document.getElementById('clip').addEventListener('click', clip);
