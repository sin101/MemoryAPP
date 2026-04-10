/**
 * contentExtractor.ts
 * Pulls full readable text from any content type.
 * No heavy dependencies — custom HTML cleaner avoids jsdom.
 */

const FETCH_TIMEOUT_MS = 10_000;

// ── HTML → plain text ──────────────────────────────────────────────────────

/** Tags whose entire subtree we throw away */
const STRIP_TAGS = new Set([
  'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
  'nav', 'header', 'footer', 'aside', 'form', 'button',
  'figure', 'figcaption', 'picture', 'video', 'audio',
  'advertisement', 'ads',
]);

function stripTag(html: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
  return html.replace(re, ' ');
}

function stripAllComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function extractHtmlText(html: string): string {
  let text = stripAllComments(html);

  // Remove unwanted subtrees
  for (const tag of STRIP_TAGS) {
    text = stripTag(text, tag);
  }

  // Prefer <article> or <main> content when available
  const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    || text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (articleMatch) {
    text = articleMatch[1];
  }

  // Replace block-level tags with newlines
  text = text.replace(/<\/(p|div|li|h[1-6]|blockquote|section|td|tr)>/gi, '\n');

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&[a-z]+;/gi, ' ');

  // Collapse whitespace
  text = text
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 30) // drop short/empty lines (nav items etc.)
    .join('\n');

  return text.slice(0, 50_000).trim(); // cap at 50k chars
}

// ── YouTube transcript ─────────────────────────────────────────────────────

interface TranscriptEntry {
  text: string;
  duration: number;
  offset: number;
}

export async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    // Dynamic import so the rest of the module still works if pkg missing
    const { YoutubeTranscript } = await import('youtube-transcript');
    const entries: TranscriptEntry[] = await YoutubeTranscript.fetchTranscript(videoId);
    if (!entries.length) return null;
    return entries
      .map(e => e.text.replace(/\[.*?\]/g, '').trim()) // strip [Music] annotations
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return null;
  }
}

// ── Article full text ──────────────────────────────────────────────────────

async function fetchArticleText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MemoryApp/1.0)',
        Accept: 'text/html,*/*',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const text = extractHtmlText(html);
    return text.length > 100 ? text : null;
  } catch {
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface ExtractedContent {
  text: string;
  /** true when the text came from a real transcript/article, not a fallback */
  isRich: boolean;
}

export async function extractContent(
  type: string,
  opts: { url?: string; videoId?: string; existingContent?: string }
): Promise<ExtractedContent> {
  const { url, videoId, existingContent } = opts;

  if (type === 'youtube' && videoId) {
    const transcript = await fetchYouTubeTranscript(videoId);
    if (transcript && transcript.length > 50) {
      return { text: transcript, isRich: true };
    }
  }

  if ((type === 'article' || type === 'link') && url) {
    const article = await fetchArticleText(url);
    if (article) return { text: article, isRich: true };
  }

  // Fallback to whatever we already have (OG description, etc.)
  if (existingContent && existingContent.length > 20) {
    return { text: existingContent, isRich: false };
  }

  return { text: '', isRich: false };
}
