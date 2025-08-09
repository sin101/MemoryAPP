import React, { useEffect, useState } from 'react';
import { fetchSuggestion } from '../suggestions';

export default function SuggestionsList({ card, cards = [], enabled = true, onAdd, onEdit }) {
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (!enabled) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    async function load() {
      const tags = card
        ? Array.from(card.tags)
        : (() => {
            const tagCounts = {};
            cards.forEach(c =>
              c.tags.forEach(t => {
                tagCounts[t] = (tagCounts[t] || 0) + 1;
              })
            );
            return Object.entries(tagCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([t]) => t);
          })();
      const tasks = tags.map(t => fetchSuggestion(t, 'text', controller.signal));
      const results = await Promise.allSettled(tasks);
      const collected = results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);
      setSuggestions(collected);
    }
    load();
    return () => controller.abort();
  }, [card, cards, enabled]);

  if (!enabled) {
    return <p className="text-gray-500">Web suggestions disabled</p>;
  }

  if (!card && suggestions.length === 0) {
    return <p className="text-gray-500">No suggestions available</p>;
  }

  if (!card && suggestions.length > 0) {
    return (
      <ul className="list-disc pl-5 space-y-1">
        {suggestions.map((s, i) => (
          <li key={s.url || s.title} className="space-x-1">
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                {s.title}
              </a>
            ) : (
              s.title
            )}
            {s.source && (
              <span className="text-gray-500 text-sm ml-1">({s.source})</span>
            )}
            {s.description && <span className="text-gray-700"> - {s.description}</span>}
            <button className="text-green-600 ml-1" onClick={() => onAdd && onAdd(s)}>Add</button>
            <button className="text-yellow-600" onClick={() => onEdit && onEdit(s)}>Edit</button>
            <button className="text-red-600" onClick={() => setSuggestions(prev => prev.filter((_, idx) => idx !== i))}>Ignore</button>
            {s.url && <button className="text-blue-600" onClick={() => window.open(s.url)}>View</button>}
          </li>
        ))}
      </ul>
    );
  }

  if (!card) {
    return <p className="text-gray-500">Select a card to see suggestions</p>;
  }

  return (
    <ul className="list-disc pl-5 space-y-1">
      {suggestions.map((s, i) => (
        <li key={s.url || s.title} className="space-x-1">
          {s.url ? (
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              {s.title}
            </a>
          ) : (
            s.title
          )}
          {s.source && (
            <span className="text-gray-500 text-sm ml-1">({s.source})</span>
          )}
          {s.description && <span className="text-gray-700"> - {s.description}</span>}
          <button className="text-green-600 ml-1" onClick={() => onAdd && onAdd(s)}>Add</button>
          <button className="text-yellow-600" onClick={() => onEdit && onEdit(s)}>Edit</button>
          <button className="text-red-600" onClick={() => setSuggestions(prev => prev.filter((_, idx) => idx !== i))}>Ignore</button>
          {s.url && <button className="text-blue-600" onClick={() => window.open(s.url)}>View</button>}
        </li>
      ))}
    </ul>
  );
}
