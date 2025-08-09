async function fetchFromWikipedia(tag, signal) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(tag)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
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
    console.error(e);
  }
  return null;
}

async function fetchFromReddit(tag, signal) {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(tag)}&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'MemoryApp/1.0' }, signal });
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
    console.error(e);
  }
  return null;
}

async function fetchFromRSS(tag, signal) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(tag)}`;
    const res = await fetch(url, { signal });
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
    console.error(e);
  }
  return null;
}

let cachedYTKey;
function getYouTubeApiKey() {
  if (cachedYTKey !== undefined) {
    return cachedYTKey;
  }
  if (typeof window !== 'undefined') {
    cachedYTKey = window.YT_API_KEY || window.prompt('Enter YouTube API key');
    window.YT_API_KEY = cachedYTKey;
    return cachedYTKey;
  }
  cachedYTKey = null;
  return null;
}

async function fetchFromYouTube(tag, signal) {
  try {
    const apiKey = getYouTubeApiKey();
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(tag)}${apiKey ? `&key=${apiKey}` : ''}`;
    const res = await fetch(url, { signal });
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
    console.error(e);
  }
  return null;
}

async function fetchFromArXiv(tag, signal) {
  try {
    const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(tag)}&start=0&max_results=1`;
    const res = await fetch(url, { headers: { Accept: 'application/atom+xml' }, signal });
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
    console.error(e);
  }
  return null;
}

export async function fetchSuggestion(tag, type = 'text', signal) {
  const strategies = [];
  if (type === 'video') {
    strategies.push(fetchFromYouTube);
  } else if (type === 'academic') {
    strategies.push(fetchFromArXiv);
  }
  strategies.push(fetchFromReddit, fetchFromRSS, fetchFromWikipedia);
  const tasks = strategies.map(fn => fn(tag, signal));
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      return r.value;
    }
  }
  return { tag, title: tag, description: '', url: '', source: 'none' };
}

export { fetchFromWikipedia, fetchFromReddit, fetchFromRSS, fetchFromYouTube, fetchFromArXiv };
