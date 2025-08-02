const sampleCards = [
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

const cardsContainer = document.getElementById('cards');
const searchInput = document.getElementById('search');
const themeToggle = document.getElementById('theme-toggle');

function renderCards(cards = sampleCards) {
  cardsContainer.innerHTML = '';
  if (!cards.length) {
    const msg = document.createElement('p');
    msg.id = 'no-results';
    msg.textContent = 'No cards found';
    cardsContainer.appendChild(msg);
    return;
  }
  for (const card of cards) {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <h3>${card.title}</h3>
      <p>${card.description}</p>
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
  const filtered = sampleCards.filter(
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
  for (const card of sampleCards) {
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

renderCards();
showThemeSuggestions();
