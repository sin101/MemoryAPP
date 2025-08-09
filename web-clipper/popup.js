const api = typeof browser !== 'undefined' ? browser : chrome;

function getQueue() {
  return new Promise(resolve => {
    api.storage.local.get('queue', res => resolve(res.queue || []));
  });
}

function setQueue(queue) {
  return new Promise(resolve => {
    api.storage.local.set({ queue }, resolve);
  });
}

function getToken() {
  return new Promise(resolve => {
    api.storage.local.get('token', res => resolve(res.token || ''));
  });
}

function setToken(token) {
  return new Promise(resolve => {
    api.storage.local.set({ token }, resolve);
  });
}

async function getAuthHeaders() {
  const token = await getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function flushQueue() {
  const queue = await getQueue();
  const remaining = [];
  const headers = await getAuthHeaders();
  for (const data of queue) {
    try {
      await fetch('http://localhost:3000/api/clip', {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
    } catch (e) {
      remaining.push(data);
    }
  }
  await setQueue(remaining);
}

flushQueue();

async function clip() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const [{ result: selection }] = await api.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString(),
  });
  const screenshot = await api.tabs.captureVisibleTab();
  const data = { title: tab.title, url: tab.url, content: selection, screenshot };
  const headers = await getAuthHeaders();
  try {
    await fetch('http://localhost:3000/api/clip', {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
  } catch (e) {
    const queue = await getQueue();
    queue.push(data);
    await setQueue(queue);
  }
  window.close();
}

getToken().then(token => {
  document.getElementById('token').value = token;
});
document.getElementById('token').addEventListener('input', e =>
  setToken(e.target.value)
);
document.getElementById('clip').addEventListener('click', clip);
