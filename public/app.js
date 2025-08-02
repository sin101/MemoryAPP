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

function renderCards() {
  for (const card of sampleCards) {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <h3>${card.title}</h3>
      <p>${card.description}</p>
      <div class="tags">${card.tags
        .map(t => `<span class="tag" data-tag="${t}">${t}</span>`)
        .join('')}</div>`;
    el.addEventListener('click', () => showCardSuggestions(card));
    cardsContainer.appendChild(el);
  }
}

const { fetchSuggestion } = window.suggestions;

async function showCardSuggestions(card) {
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

renderCards();
showThemeSuggestions();
