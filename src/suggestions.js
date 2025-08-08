if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}
const { XMLParser } = require('fast-xml-parser');
const FETCH_TIMEOUT_MS = 1000;

function cosineSimilarity(a, b) {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (!normA || !normB) return 0;
  return dot / Math.sqrt(normA * normB);
}

async function timedFetch(url, options = {}, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const fetchPromise = fetch(url, { ...options, signal: controller.signal });
  const timeoutPromise = new Promise((_, reject) => {
    controller.signal.addEventListener(
      'abort',
      () => reject(new Error('timeout')),
      { once: true }
    );
  });
  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromWikipedia(tag) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(tag)}`;
    const res = await timedFetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      return {
        tag,
        title: data.title,
        description: data.extract,
        url: (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) || `https://en.wikipedia.org/wiki/${encodeURIComponent(tag)}`,
        source: 'wikipedia',
      };
    }
  } catch (e) {
    // ignore network errors
  }
  return null;
}

async function fetchFromReddit(tag) {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(tag)}&limit=1`;
    const res = await timedFetch(url, { headers: { 'User-Agent': 'MemoryApp/1.0' } });
    if (res.ok) {
      const data = await res.json();
      const item = data && data.data && data.data.children && data.data.children[0] && data.data.children[0].data;
      if (item) {
        return {
          tag,
          title: item.title,
          description: item.selftext || '',
          url: `https://www.reddit.com${item.permalink}`,
          source: 'reddit',
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
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(tag)}`;
    const res = await timedFetch(url);
    if (res.ok) {
      const text = await res.text();
      try {
        const parser = new XMLParser();
        const parsed = parser.parse(text);
        const items = parsed && parsed.rss && parsed.rss.channel && parsed.rss.channel.item;
        const first = Array.isArray(items) ? items[0] : items;
        if (first && first.title && first.link) {
          return {
            tag,
            title: first.title,
            description: '',
            url: first.link,
            source: 'rss',
          };
        }
      } catch (e) {
        return null;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function fetchFromYouTube(tag) {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(tag)}${apiKey ? `&key=${apiKey}` : ''}`;
    const res = await timedFetch(url);
    if (res.ok) {
      const data = await res.json();
      const item = data && data.items && data.items[0];
      if (item) {
        return {
          tag,
          title: item.snippet.title,
          description: item.snippet.description,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          source: 'youtube',
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
    const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(tag)}&start=0&max_results=1`;
    const res = await timedFetch(url, { headers: { Accept: 'application/atom+xml' } });
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/<entry>.*?<title>([^<]+)<\/title>.*?<id>([^<]+)<\/id>/s);
      if (match) {
        return {
          tag,
          title: match[1].trim(),
          description: '',
          url: match[2].trim(),
          source: 'arxiv',
        };
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function fetchSuggestion(
  tag,
  type = 'text',
  app = null,
  threshold = 0.2
) {
  const strategies = [];
  if (type === 'video') {
    strategies.push(fetchFromYouTube);
  } else if (type === 'academic') {
    strategies.push(fetchFromArXiv);
  }
  strategies.push(fetchFromReddit, fetchFromRSS, fetchFromWikipedia);
  const results = await Promise.all(
    strategies.map(fn => fn(tag).catch(() => null))
  );
  const suggestions = results.filter(Boolean);
  if (suggestions.length === 0) {
    return { tag, title: tag, description: '', url: '', source: 'none' };
  }
  if (app && app.ai && app.ai.embed) {
    let tagVec = null;
    try {
      tagVec = await (app.getTagVector
        ? app.getTagVector(tag)
        : app.ai.embed(tag));
    } catch {
      tagVec = null;
    }
    let cardVecs = [];
    if (app.getCardEmbeddingsForTag) {
      try {
        cardVecs = await app.getCardEmbeddingsForTag(tag);
      } catch {
        cardVecs = [];
      }
    }
    for (const s of suggestions) {
      try {
        s.embedding = await app.ai.embed(`${s.title} ${s.description}`);
      } catch {
        s.embedding = [];
      }
      let score = 0;
      if (tagVec) {
        score = cosineSimilarity(s.embedding, tagVec);
      }
      for (const cv of cardVecs) {
        const cs = cosineSimilarity(s.embedding, cv);
        if (cs > score) score = cs;
      }
      s._similarity = score;
    }
    suggestions.sort((a, b) => b._similarity - a._similarity);
    const best = suggestions[0];
    if (!best || best._similarity < threshold) {
      return { tag, title: tag, description: '', url: '', source: 'none' };
    }
    return best;
  }
  return suggestions[0];
}

const api = {
  fetchFromWikipedia,
  fetchFromReddit,
  fetchFromRSS,
  fetchFromYouTube,
  fetchFromArXiv,
  fetchSuggestion,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof window !== 'undefined') {
  window.suggestions = api;
}

