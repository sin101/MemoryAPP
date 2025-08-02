const FETCH_TIMEOUT_MS = 1000;

async function timedFetch(url, options = {}, timeout = FETCH_TIMEOUT_MS) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout)),
  ]);
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
      const match = text.match(/<item>\s*<title>([^<]+)<\/title>\s*<link>([^<]+)<\/link>/i);
      if (match) {
        return {
          tag,
          title: match[1],
          description: '',
          url: match[2],
          source: 'rss',
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

async function fetchSuggestion(tag, type = 'text') {
  const strategies = [];
  if (type === 'video') {
    strategies.push(fetchFromYouTube);
  } else if (type === 'academic') {
    strategies.push(fetchFromArXiv);
  }
  strategies.push(fetchFromReddit, fetchFromRSS, fetchFromWikipedia);
  const promises = strategies.map(fn =>
    fn(tag).then(res => (res ? res : Promise.reject(new Error('no result'))))
  );
  try {
    return await Promise.any(promises);
  } catch {
    return { tag, title: tag, description: '', url: '', source: 'none' };
  }
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

