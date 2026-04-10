import React, { useEffect, useState, useMemo } from 'react';
import { fetchSuggestion } from '../suggestions';

export default function SuggestionsList({ card, cards = [], enabled = true, onAdd, onEdit }) {
  const [suggestions, setSuggestions] = useState([]);

  // Compute top tags independently so `cards` array mutations don't retrigger for unrelated changes
  const topTags = useMemo(() => {
    if (card) return Array.from(card.tags).slice(0, 3);
    const tagCounts = {};
    for (const c of cards) {
      for (const t of c.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
  }, [card, cards]);

  // Stable join key — only re-fetch when tag set actually changes
  const tagKey = topTags.join(',');

  useEffect(() => {
    if (!enabled || !topTags.length) { setSuggestions([]); return; }
    const controller = new AbortController();
    Promise.allSettled(topTags.map(t => fetchSuggestion(t, 'text', controller.signal)))
      .then(results => {
        if (controller.signal.aborted) return;
        setSuggestions(results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tagKey]);

  if (!enabled) return <p className="text-gray-500">Web suggestions disabled</p>;
  if (!suggestions.length) return <p className="text-gray-500">{card ? 'No suggestions for this card' : 'Select a card to see suggestions'}</p>;

  return (
    <ul className="list-disc pl-5 space-y-1">
      {suggestions.map((s, i) => (
        <li key={s.url || s.title} className="space-x-1">
          {s.url
            ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{s.title}</a>
            : s.title}
          {s.source && <span className="text-gray-500 text-sm ml-1">({s.source})</span>}
          {s.description && <span className="text-gray-700"> - {s.description}</span>}
          <button className="text-green-600 ml-1" onClick={() => onAdd?.(s)}>Add</button>
          <button className="text-yellow-600" onClick={() => onEdit?.(s)}>Edit</button>
          <button className="text-red-600" onClick={() => setSuggestions(prev => prev.filter((_, idx) => idx !== i))}>Ignore</button>
          {s.url && <button className="text-blue-600" onClick={() => window.open(s.url)}>View</button>}
        </li>
      ))}
    </ul>
  );
}
