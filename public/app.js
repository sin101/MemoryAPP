let cards = JSON.parse(localStorage.getItem('cards') || '[]');
if (cards.length === 0) {
  cards = [
    {
      id: '1',
      title: 'Sample Note',
      description: 'Demo card used for the UI prototype.',
      tags: ['demo', 'sample']
    },
    {
      id: '2',
      title: 'JavaScript',
      description: 'Notes about JS.',
      tags: ['JavaScript', 'code']
    }
  ];
}
let nextId = cards.reduce((m, c) => Math.max(m, Number(c.id)), 0) + 1;

const cardsContainer = document.getElementById('cards');
const searchInput = document.getElementById('search');
const themeToggle = document.getElementById('theme-toggle');
const addForm = document.getElementById('add-card-form');
const titleInput = document.getElementById('new-title');
const descInput = document.getElementById('new-description');
const tagsInput = document.getElementById('new-tags');
const apiKeyInput = document.getElementById('api-key');
const summaryModelSelect = document.getElementById('summary-model');
const imageModelSelect = document.getElementById('image-model');

apiKeyInput.value = localStorage.getItem('hfKey') || '';
apiKeyInput.addEventListener('input', () =>
  localStorage.setItem('hfKey', apiKeyInput.value.trim())
);
summaryModelSelect.value =
  localStorage.getItem('summaryModel') || 'google/flan-t5-base';
imageModelSelect.value =
  localStorage.getItem('imageModel') ||
  'stabilityai/stable-diffusion-xl-base-1.0';
summaryModelSelect.addEventListener('change', () =>
  localStorage.setItem('summaryModel', summaryModelSelect.value)
);
imageModelSelect.addEventListener('change', () =>
  localStorage.setItem('imageModel', imageModelSelect.value)
);

function getApiKey() {
  return apiKeyInput.value.trim();
}

function getSummaryModel() {
  return summaryModelSelect.value;
}

function getImageModel() {
  return imageModelSelect.value;
}

function saveCards() {
  localStorage.setItem('cards', JSON.stringify(cards));
}

function renderCards(list = cards) {
  cardsContainer.innerHTML = '';
  if (!list.length) {
    const msg = document.createElement('p');
    msg.id = 'no-results';
    msg.textContent = 'No cards found';
    cardsContainer.appendChild(msg);
    return;
  }
  for (const card of list) {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <h3>${card.title}</h3>
      ${card.image ? `<img src="${card.image}" alt="illustration">` : ''}
      <p>${card.description}</p>
      ${card.summary ? `<p class="summary">${card.summary}</p>` : ''}
      <div class="tags">${card.tags
        .map(t => `<span class="tag" data-tag="${t}">${t}</span>`)
        .join('')}</div>`;
    el.addEventListener('click', () => showCardSuggestions(card, el));
    el.querySelectorAll('.tag').forEach(tagEl => {
      tagEl.addEventListener('click', e => {
        e.stopPropagation();
        const tag = tagEl.dataset.tag;
        searchInput.value = tag;
        filterCards(tag);
        const list = document.getElementById('suggestion-list');
        list.innerHTML = '';
      });
    });
    cardsContainer.appendChild(el);
  }
}

function filterCards(query) {
  const q = query.trim().toLowerCase();
  const filtered = cards.filter(
    c =>
      c.title.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q))
  );
  renderCards(filtered);
}

const { fetchSuggestion } = window.suggestions;

async function showCardSuggestions(card, element) {
  document
    .querySelectorAll('.card.selected')
    .forEach(el => el.classList.remove('selected'));
  element.classList.add('selected');
  const list = document.getElementById('suggestion-list');
  list.innerHTML = '';
  for (const tag of card.tags) {
    const s = await fetchSuggestion(tag);
    const li = document.createElement('li');
    li.innerHTML = `<a href="${s.url}" target="_blank">${s.title}</a> (${s.source}) - ${s.description}`;
    list.appendChild(li);
  }
}

async function showThemeSuggestions() {
  const counts = {};
  for (const card of cards) {
    for (const tag of card.tags) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  const top = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, 3);
  const list = document.getElementById('suggestion-list');
  list.innerHTML = '';
  for (const tag of top) {
    const s = await fetchSuggestion(tag);
    const li = document.createElement('li');
    li.innerHTML = `<a href="${s.url}" target="_blank">${s.title}</a> (${s.source}) - ${s.description}`;
    list.appendChild(li);
  }
}

searchInput.addEventListener('input', e => {
  filterCards(e.target.value);
  const list = document.getElementById('suggestion-list');
  list.innerHTML = '';
  if (!e.target.value) {
    showThemeSuggestions();
  }
});

function setTheme(mode) {
  document.body.classList.toggle('dark', mode === 'dark');
  themeToggle.textContent = mode === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', mode);
}

const savedTheme = localStorage.getItem('theme') || 'light';
setTheme(savedTheme);

themeToggle.addEventListener('click', () => {
  const newTheme = document.body.classList.contains('dark') ? 'light' : 'dark';
  setTheme(newTheme);
});

async function summarizeText(text) {
  const key = getApiKey();
  const model = getSummaryModel();
  if (!key || !text) {
    return text.length > 100 ? text.slice(0, 100) + '…' : text;
  }
  try {
    const res = await fetch(
      `https://api-inference.huggingface.co/models/${encodeURIComponent(
        model
      )}?wait_for_model=true`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({ inputs: text })
      }
    );
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const data = await res.json();
    return data[0]?.summary_text?.trim() || '';
  } catch (err) {
    console.error('summary failed', err);
    return text.length > 100 ? text.slice(0, 100) + '…' : text;
  }
}

async function generateImage(prompt) {
  const key = getApiKey();
  const fallback = `https://source.unsplash.com/200x200/?${encodeURIComponent(
    prompt || 'abstract'
  )}`;
  const model = getImageModel();
  const styledPrompt = `a cartoon art deco illustration of ${prompt}`;
  if (!key || !prompt) {
    return fallback;
  }
  try {
    const res = await fetch(
      `https://api-inference.huggingface.co/models/${encodeURIComponent(
        model
      )}?wait_for_model=true`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({ inputs: styledPrompt })
      }
    );
    if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) {
      throw new Error(await res.text());
    }
    const arrayBuffer = await res.arrayBuffer();
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer))
    );
    return `data:image/png;base64,${base64}`;
  } catch (err) {
    console.error('image failed', err);
    return fallback;
  }
}

addForm.addEventListener('submit', async e => {
  e.preventDefault();
  const title = titleInput.value.trim();
  const description = descInput.value.trim();
  const tags = tagsInput.value
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
  if (!title) {
    return;
  }
  const summary = await summarizeText(description);
  const image = await generateImage(description || tags.join(', '));
  cards.push({ id: String(nextId++), title, description, tags, summary, image });
  saveCards();
  renderCards();
  showThemeSuggestions();
  addForm.reset();
});

renderCards();
showThemeSuggestions();

(async function enrichExisting() {
  for (const card of cards) {
    if (!card.summary && card.description) {
      card.summary = await summarizeText(card.description);
    }
    if (!card.image && (card.description || card.tags.length)) {
      card.image = await generateImage(card.description || card.tags.join(', '));
    }
  }
  saveCards();
  renderCards();
})();
