export interface UrlMeta {
  type: 'youtube' | 'tweet' | 'article' | 'link';
  url: string;
  title: string;
  description?: string;
  image?: string;
  domain: string;
  videoId?: string;
  embedUrl?: string;
  handle?: string;
  tweetId?: string;
}

const FETCH_TIMEOUT_MS = 8000;

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?(?:.*&)?v=([^&]+)/,
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
    /youtube\.com\/shorts\/([^?&]+)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

function extractTweetId(url: string): string | null {
  const m = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return m ? m[1] : null;
}

function extractHandle(url: string): string | null {
  const m = url.match(/(?:twitter\.com|x\.com)\/@?(\w+)/);
  return m ? `@${m[1]}` : null;
}

function detectType(url: string): UrlMeta['type'] {
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\//.test(url)) return 'youtube';
  if (/twitter\.com\/|x\.com\//.test(url)) return 'tweet';
  return 'article';
}

function extractMetaTag(html: string, property: string): string | undefined {
  // Try og: style
  const ogRe = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const ogRe2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    'i'
  );
  const m = html.match(ogRe) || html.match(ogRe2);
  return m ? decodeHtmlEntities(m[1]) : undefined;
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decodeHtmlEntities(m[1].trim()) : undefined;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

async function fetchWithTimeout(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MemoryApp/1.0; +https://github.com/memoryapp)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function isPrivateUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.') ||
      hostname.endsWith('.local')
    );
  } catch {
    return true;
  }
}

export async function fetchUrlMeta(rawUrl: string): Promise<UrlMeta> {
  if (isPrivateUrl(rawUrl)) {
    throw new Error('Private or loopback URLs are not allowed');
  }

  const domain = new URL(rawUrl).hostname.replace(/^www\./, '');
  const type = detectType(rawUrl);

  // YouTube — use free oEmbed (no API key needed)
  if (type === 'youtube') {
    const videoId = extractYouTubeId(rawUrl);
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`;
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.ok) {
        const data = await res.json() as { title?: string; author_name?: string; thumbnail_url?: string };
        return {
          type: 'youtube',
          url: rawUrl,
          title: data.title || `YouTube – ${videoId}`,
          description: data.author_name ? `Video by ${data.author_name}` : undefined,
          image: data.thumbnail_url,
          videoId: videoId || undefined,
          embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}` : undefined,
          domain,
        };
      }
    } catch {
      // fall through to generic
    }
    return {
      type: 'youtube',
      url: rawUrl,
      title: `YouTube – ${videoId || rawUrl}`,
      videoId: videoId || undefined,
      embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}` : undefined,
      domain,
    };
  }

  // Twitter/X — extract from URL structure, no API needed
  if (type === 'tweet') {
    const tweetId = extractTweetId(rawUrl);
    const handle = extractHandle(rawUrl);
    let title = handle ? `Tweet by ${handle}` : 'Tweet';
    let description: string | undefined;
    // Try oEmbed (works without auth for public tweets)
    try {
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(rawUrl)}&omit_script=true`;
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.ok) {
        const data = await res.json() as { html?: string; author_name?: string };
        if (data.author_name) title = `Tweet by @${data.author_name}`;
        // Extract text from HTML snippet
        if (data.html) {
          const text = data.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          description = text.slice(0, 280);
        }
      }
    } catch {
      // fall through
    }
    return {
      type: 'tweet',
      url: rawUrl,
      title,
      description,
      handle: handle || undefined,
      tweetId: tweetId || undefined,
      domain,
    };
  }

  // Article / generic URL — fetch HTML and extract OG tags
  try {
    const html = await fetchWithTimeout(rawUrl);
    const title =
      extractMetaTag(html, 'og:title') ||
      extractMetaTag(html, 'twitter:title') ||
      extractTitle(html) ||
      rawUrl;
    const description =
      extractMetaTag(html, 'og:description') ||
      extractMetaTag(html, 'twitter:description') ||
      extractMetaTag(html, 'description');
    const image =
      extractMetaTag(html, 'og:image') ||
      extractMetaTag(html, 'twitter:image');

    return {
      type: 'article',
      url: rawUrl,
      title,
      description,
      image,
      domain,
    };
  } catch {
    return {
      type: 'link',
      url: rawUrl,
      title: rawUrl,
      domain,
    };
  }
}
