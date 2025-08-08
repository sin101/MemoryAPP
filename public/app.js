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
cards = cards.map(c => ({
  ...c,
  tags: c.tags || [],
  decks: c.decks || ['default'],
  favorite: c.favorite || false
}));
let nextId = cards.reduce((m, c) => Math.max(m, Number(c.id)), 0) + 1;

const cardsContainer = document.getElementById('cards');
const searchInput = document.getElementById('search');
const themeToggle = document.getElementById('theme-toggle');
const viewToggle = document.getElementById('view-toggle');
const deckList = document.getElementById('deck-list');
const graphContainer = document.getElementById('graph');
const addForm = document.getElementById('add-card-form');
const titleInput = document.getElementById('new-title');
const descInput = document.getElementById('new-description');
const tagsInput = document.getElementById('new-tags');
const apiKeyInput = document.getElementById('api-key');
const summaryModelSelect = document.getElementById('summary-model');
const imageModelSelect = document.getElementById('image-model');
const recordBtn = document.getElementById('record-audio');

let selectedDeck = 'all';
let currentView = 'cards';

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
    el.dataset.id = card.id;
    el.innerHTML = `
      <h3>${card.title}</h3>
      ${card.image ? `<img src="${card.image}" alt="illustration">` : ''}
      <p class="desc">${card.description}</p>
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
        applyFilters();
        const list = document.getElementById('suggestion-list');
        list.innerHTML = '';
      });
    });
    const controls = document.createElement('div');
    controls.className = 'card-controls';
    controls.innerHTML = `
      <button class="edit">Edit</button>
      <button class="fav ${card.favorite ? 'favorite' : ''}">${card.favorite ? '★' : '☆'}</button>
      <button class="del">Delete</button>`;
    controls.querySelector('.edit').addEventListener('click', e => {
      e.stopPropagation();
      editCard(card);
    });
    controls.querySelector('.fav').addEventListener('click', e => {
      e.stopPropagation();
      toggleFavorite(card, controls.querySelector('.fav'));
    });
    controls.querySelector('.del').addEventListener('click', e => {
      e.stopPropagation();
      deleteCard(card.id);
    });
    el.appendChild(controls);
    cardsContainer.appendChild(el);
  }
}

function editCard(card) {
  const el = document.querySelector(`.card[data-id="${card.id}"]`);
  if (!el) return;
  const desc = el.querySelector('.desc');
  const tagsDiv = el.querySelector('.tags');
  const descInput = document.createElement('textarea');
  descInput.value = card.description;
  const tagsInput = document.createElement('input');
  tagsInput.value = card.tags.join(', ');
  desc.replaceWith(descInput);
  tagsDiv.replaceWith(tagsInput);
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'save-edit';
  el.appendChild(saveBtn);
  saveBtn.addEventListener('click', e => {
    e.stopPropagation();
    card.description = descInput.value.trim();
    card.tags = tagsInput.value
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    saveCards();
    renderDecks();
    applyFilters();
    showThemeSuggestions();
  });
}

function toggleFavorite(card, btn) {
  card.favorite = !card.favorite;
  if (card.favorite) {
    if (!card.decks.includes('favorites')) {
      card.decks.push('favorites');
    }
  } else {
    card.decks = card.decks.filter(d => d !== 'favorites');
  }
  btn.textContent = card.favorite ? '★' : '☆';
  btn.classList.toggle('favorite', card.favorite);
  saveCards();
  renderDecks();
}

function deleteCard(id) {
  cards = cards.filter(c => c.id !== id);
  saveCards();
  renderDecks();
  applyFilters();
  showThemeSuggestions();
}

function filterCards(query, deck = selectedDeck) {
  const q = query.trim().toLowerCase();
  return cards.filter(c => {
    const matchesQuery =
      c.title.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q));
    const matchesDeck =
      deck === 'all' ||
      (c.decks && c.decks.includes(deck)) ||
      (deck === 'favorites' && c.favorite);
    return matchesQuery && matchesDeck;
  });
}

function applyFilters() {
  const filtered = filterCards(searchInput.value, selectedDeck);
  if (currentView === 'graph') {
    renderGraph(filtered);
  } else {
    renderCards(filtered);
  }
}

function renderDecks() {
  const deckSet = new Set();
  for (const card of cards) {
    (card.decks || []).forEach(d => deckSet.add(d));
  }
  deckList.innerHTML = '';
  const makeItem = (name, label) => {
    const li = document.createElement('li');
    li.textContent = label || name;
    li.dataset.deck = name;
    if (selectedDeck === name) li.classList.add('active');
    deckList.appendChild(li);
  };
  makeItem('all', 'All');
  for (const d of deckSet) {
    makeItem(d);
  }
  if (cards.some(c => c.favorite)) {
    makeItem('favorites', 'Favorites');
  }
}

function renderGraph(list) {
  graphContainer.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  const width = graphContainer.clientWidth || 600;
  const height = graphContainer.clientHeight || 400;
  const radius = Math.min(width, height) / 2 - 40;
  list.forEach((card, idx) => {
    const angle = (2 * Math.PI * idx) / list.length;
    card._x = width / 2 + radius * Math.cos(angle);
    card._y = height / 2 + radius * Math.sin(angle);
  });
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (list[i].tags.some(t => list[j].tags.includes(t))) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', list[i]._x);
        line.setAttribute('y1', list[i]._y);
        line.setAttribute('x2', list[j]._x);
        line.setAttribute('y2', list[j]._y);
        line.setAttribute('stroke', '#888');
        svg.appendChild(line);
      }
    }
  }
  for (const card of list) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', card._x);
    circle.setAttribute('cy', card._y);
    circle.setAttribute('r', 20);
    circle.setAttribute('fill', '#fcb900');
    circle.setAttribute('stroke', '#333');
    svg.appendChild(circle);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', card._x);
    text.setAttribute('y', card._y + 4);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '10');
    text.textContent = card.title.slice(0, 10);
    svg.appendChild(text);
  }
  graphContainer.appendChild(svg);
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
  applyFilters();
  const list = document.getElementById('suggestion-list');
  list.innerHTML = '';
  if (!e.target.value) {
    showThemeSuggestions();
  }
});

deckList.addEventListener('click', e => {
  if (e.target.matches('li')) {
    selectedDeck = e.target.dataset.deck;
    renderDecks();
    applyFilters();
  }
});

viewToggle.addEventListener('click', () => {
  currentView = currentView === 'cards' ? 'graph' : 'cards';
  viewToggle.textContent =
    currentView === 'cards' ? 'Graph View' : 'Card View';
  cardsContainer.classList.toggle('hidden', currentView !== 'cards');
  graphContainer.classList.toggle('hidden', currentView !== 'graph');
  applyFilters();
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
  const deckForNew = selectedDeck === 'all' ? ['default'] : [selectedDeck];
  cards.push({ id: String(nextId++), title, description, tags, summary, image, decks: deckForNew, favorite: false });
  saveCards();
  renderDecks();
  applyFilters();
  showThemeSuggestions();
  addForm.reset();
});

if (recordBtn) {
  let mediaRecorder = null;
  let chunks = [];
  recordBtn.addEventListener('click', async () => {
    if (!mediaRecorder) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        chunks = [];
        const base64 = await new Promise(res => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result.split(',')[1]);
          reader.readAsDataURL(blob);
        });
        const response = await fetch('/api/audio-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64 })
        });
        const card = await response.json();
        card.decks = card.decks || (selectedDeck === 'all' ? ['default'] : [selectedDeck]);
        card.favorite = false;
        cards.push(card);
        saveCards();
        renderDecks();
        applyFilters();
      };
      mediaRecorder.start();
      recordBtn.textContent = 'Stop';
    } else {
      mediaRecorder.stop();
      mediaRecorder = null;
      recordBtn.textContent = 'Record Audio Note';
    }
  });
}

renderDecks();
applyFilters();
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
  renderDecks();
  applyFilters();
})();
