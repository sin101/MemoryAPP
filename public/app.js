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

async function fetchFromWikipedia(tag) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(tag)}`);
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title,
        description: data.extract,
        url: (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) || `https://en.wikipedia.org/wiki/${encodeURIComponent(tag)}`,
        source: 'wikipedia'
      };
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function fetchFromReddit(tag) {
  try {
    const res = await fetch(`https://www.reddit.com/search.json?q=${encodeURIComponent(tag)}&limit=1`);
    if (res.ok) {
      const data = await res.json();
      const item = data && data.data && data.data.children && data.data.children[0] && data.data.children[0].data;
      if (item) {
        return {
          title: item.title,
          description: item.selftext || '',
          url: `https://www.reddit.com${item.permalink}`,
          source: 'reddit'
        };
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function fetchFromRSS(tag) {
  try {
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(tag)}`);
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/<item>\s*<title>([^<]+)<\/title>\s*<link>([^<]+)<\/link>/i);
      if (match) {
        return {
          title: match[1],
          description: '',
          url: match[2],
          source: 'rss'
        };
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function fetchFromYouTube(tag) {
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(tag)}`);
    if (res.ok) {
      const data = await res.json();
      const item = data && data.items && data.items[0];
      if (item) {
        return {
          title: item.snippet.title,
          description: item.snippet.description,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          source: 'youtube'
        };
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function fetchFromArXiv(tag) {
  try {
    const res = await fetch(`http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(tag)}&start=0&max_results=1`);
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/<entry>.*?<title>([^<]+)<\/title>.*?<id>([^<]+)<\/id>/s);
      if (match) {
        return {
          title: match[1].trim(),
          description: '',
          url: match[2].trim(),
          source: 'arxiv'
        };
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function fetchSuggestion(tag, type = 'text') {
  const strategies = [];
  if (type === 'video') {
    strategies.push(fetchFromYouTube);
  } else if (type === 'academic') {
    strategies.push(fetchFromArXiv);
  }
  strategies.push(fetchFromReddit, fetchFromRSS, fetchFromWikipedia);
  for (const fn of strategies) {
    const s = await fn(tag);
    if (s) return s;
  }
  return { title: tag, description: '', url: '#', source: 'none' };
}

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
