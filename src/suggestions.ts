// @ts-nocheck
function getFetch() {
  return (global as any).fetch || require('node-fetch');
}
import { XMLParser } from 'fast-xml-parser';

const FETCH_TIMEOUT_MS = 1000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { ts: number; value: any }>();

async function timedFetch(url: string, options: any = {}, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const fetchPromise = getFetch()(url, { ...options, signal: controller.signal });
  const timeoutPromise = new Promise((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
  });
  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

function getKey(tag: string, source: string) {
  return `${source}:${tag}`;
}

async function fetchWithCache(tag: string, source: string, fn: (tag: string) => Promise<any>) {
  const key = getKey(tag, source);
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }
  if (cached) {
    fn(tag).then(res => {
      if (res) {
        cache.set(key, { ts: Date.now(), value: res });
      }
    });
    return cached.value;
  }
  const res = await fn(tag);
  if (res) cache.set(key, { ts: now, value: res });
  return res;
}

export function clearSuggestionCache(tag?: string, source?: string) {
  if (!tag && !source) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    const [s, t] = key.split(':');
    if ((source && s !== source) || (tag && t !== tag)) continue;
    cache.delete(key);
  }
}

async function fetchFromWikipedia(tag: string) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(tag)}`;
    const res = await timedFetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data: any = await res.json();
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

async function fetchFromReddit(tag: string) {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(tag)}&limit=1`;
    const res = await timedFetch(url, { headers: { 'User-Agent': 'MemoryApp/1.0' } });
    if (res.ok) {
      const data: any = await res.json();
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

async function fetchFromRSS(tag: string) {
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

async function fetchFromYouTube(tag: string) {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(tag)}${apiKey ? `&key=${apiKey}` : ''}`;
    const res = await timedFetch(url);
    if (res.ok) {
      const data: any = await res.json();
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

async function fetchFromArXiv(tag: string) {
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

export async function fetchSuggestion(tag: string, type = 'text') {
  const strategies: Array<(t: string) => Promise<any>> = [];
  if (type === 'video') {
    strategies.push(t => fetchWithCache(t, 'youtube', fetchFromYouTube));
  } else if (type === 'academic') {
    strategies.push(t => fetchWithCache(t, 'arxiv', fetchFromArXiv));
  }
  strategies.push(
    t => fetchWithCache(t, 'reddit', fetchFromReddit),
    t => fetchWithCache(t, 'rss', fetchFromRSS),
    t => fetchWithCache(t, 'wikipedia', fetchFromWikipedia)
  );
  const promises = strategies.map(fn =>
    fn(tag).then(res => (res ? res : Promise.reject(new Error('no result'))))
  );
  try {
    return await Promise.any(promises);
  } catch {
    return { tag, title: tag, description: '', url: '', source: 'none' };
  }
}

export {
  fetchFromWikipedia,
  fetchFromReddit,
  fetchFromRSS,
  fetchFromYouTube,
  fetchFromArXiv,
};
