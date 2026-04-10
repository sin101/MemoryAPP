import React, { useEffect, useState, useMemo } from 'react';
import { fetchSuggestion } from '../suggestions';

// ── Pollinations-generated recommendations ────────────────────────────────────
async function fetchPollinationsSuggestions(card, signal) {
  const tags = (card.tags || []).slice(0, 8).join(', ');
  // For YouTube/video cards, prefer transcript content (richer context than description)
  const richContent = card.type === 'youtube' || card.type === 'video'
    ? (card.content || card.summary || card.description || '')
    : (card.summary || card.description || card.content || '');
  const context = [card.title, richContent].filter(Boolean).join(' — ').slice(0, 500);
  const prompt =
    `Given a card titled "${card.title}" with tags [${tags}] and context: "${context}", ` +
    'suggest 4 specific, real resources a person would find useful. ' +
    'For each, provide a title, 1-sentence description, and a real URL (Wikipedia, GitHub, YouTube, arXiv, or reputable news). ' +
    'Reply ONLY with a JSON array: [{"title":"...","description":"...","url":"...","source":"ai"}]. No markdown, no extra text.';

  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai-large',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
      }),
      signal,
    });
    if (!res.ok) return [];
    const j = await res.json();
    const content = j.choices?.[0]?.message?.content ?? '';
    if (content.includes('IMPORTANT NOTICE') || content.includes('deprecated')) return [];
    const match = content.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(r => r && typeof r.title === 'string' && typeof r.url === 'string')
      .map(r => ({ ...r, tag: card.tags?.[0] || '', source: 'ai' }));
  } catch {
    return [];
  }
}

// ── Related local cards (share 2+ tags with the selected card) ───────────────
function findRelatedCards(card, allCards) {
  if (!card || !allCards.length) return [];
  const cardTags = new Set(card.tags || []);
  if (!cardTags.size) return [];
  return allCards
    .filter(c => c.id !== card.id)
    .map(c => {
      const shared = (c.tags || []).filter(t => cardTags.has(t));
      return { card: c, shared };
    })
    .filter(x => x.shared.length >= 2)
    .sort((a, b) => b.shared.length - a.shared.length)
    .slice(0, 4)
    .map(x => x.card);
}

// ── Source badge ──────────────────────────────────────────────────────────────
function SourceBadge({ source }) {
  const colors = {
    ai: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    wikipedia: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    reddit: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    rss: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    youtube: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    arxiv: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${colors[source] || 'bg-gray-100 text-gray-600'}`}>
      {source}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SuggestionsList({ card, cards = [], enabled = true, onAdd, onEdit, onSelectCard }) {
  const [webSuggestions, setWebSuggestions] = useState([]);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [ignored, setIgnored] = useState(new Set());
  const [aiLoading, setAiLoading] = useState(false);

  // Use all tags (up to 5) for web lookups
  const topTags = useMemo(() => {
    if (card) return (card.tags || []).slice(0, 5);
    const tagCounts = {};
    for (const c of cards) {
      for (const t of (c.tags || [])) tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
  }, [card, cards]);

  const tagKey = topTags.join(',');

  // Related local cards
  const relatedCards = useMemo(() => (card ? findRelatedCards(card, cards) : []), [card, cards]);

  // Web lookup suggestions
  useEffect(() => {
    if (!enabled || !topTags.length) { setWebSuggestions([]); return; }
    const controller = new AbortController();
    const cardType = card?.type || 'text';
    Promise.allSettled(topTags.map(t => fetchSuggestion(t, cardType, controller.signal)))
      .then(results => {
        if (controller.signal.aborted) return;
        setWebSuggestions(
          results
            .filter(r => r.status === 'fulfilled' && r.value && r.value.source !== 'none')
            .map(r => r.value)
        );
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tagKey]);

  // Pollinations AI suggestions (only when a specific card is selected)
  useEffect(() => {
    if (!enabled || !card) { setAiSuggestions([]); return; }
    const controller = new AbortController();
    setAiLoading(true);
    fetchPollinationsSuggestions(card, controller.signal)
      .then(results => {
        if (controller.signal.aborted) return;
        setAiSuggestions(results);
      })
      .finally(() => { if (!controller.signal.aborted) setAiLoading(false); });
    return () => { controller.abort(); setAiLoading(false); };
  }, [enabled, card?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) return <p className="text-gray-500 text-sm">Web suggestions disabled</p>;

  const allSuggestions = [
    ...aiSuggestions.filter(s => !ignored.has(s.url || s.title)),
    ...webSuggestions.filter(s => !ignored.has(s.url || s.title) && !aiSuggestions.some(a => a.url === s.url)),
  ];

  return (
    <div className="space-y-4">
      {/* Related local cards */}
      {relatedCards.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Related cards</p>
          <div className="space-y-1.5">
            {relatedCards.map(c => (
              <button
                key={c.id}
                onClick={() => onSelectCard?.(c)}
                className="w-full text-left px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.title}</p>
                {c.tags?.length > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {c.tags.filter(t => (card?.tags || []).includes(t)).join(' · ')}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Web + AI suggestions */}
      {(allSuggestions.length > 0 || aiLoading) && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Recommended resources
            {aiLoading && <span className="ml-2 text-purple-500 animate-pulse">AI generating…</span>}
          </p>
          <div className="space-y-2">
            {allSuggestions.map((s, i) => (
              <div key={s.url || s.title || i} className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    {s.url
                      ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline line-clamp-2">{s.title}</a>
                      : <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.title}</p>
                    }
                  </div>
                  <SourceBadge source={s.source} />
                </div>
                {s.description && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-1.5">{s.description}</p>
                )}
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => onAdd?.(s)} className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50">Add</button>
                  <button onClick={() => onEdit?.(s)} className="text-xs px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/50">Edit</button>
                  <button onClick={() => setIgnored(prev => new Set([...prev, s.url || s.title]))} className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600">Ignore</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!aiLoading && allSuggestions.length === 0 && relatedCards.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {card ? 'No suggestions found for this card' : 'Select a card to see suggestions'}
        </p>
      )}
    </div>
  );
}
