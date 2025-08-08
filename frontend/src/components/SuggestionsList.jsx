import React, { useEffect, useState } from 'react';
import { fetchSuggestion } from '../suggestions';

export default function SuggestionsList({ card }) {
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (!card) {
      setSuggestions([]);
      return;
    }
    async function load() {
      const results = [];
      for (const tag of card.tags) {
        try {
          const s = await fetchSuggestion(tag);
          results.push(s);
        } catch (err) {
          console.error('suggestion failed', err);
        }
      }
      setSuggestions(results);
    }
    load();
  }, [card]);

  if (!card) {
    return <p className="text-gray-500">Select a card to see suggestions</p>;
  }

  return (
    <ul className="list-disc pl-5 space-y-1">
      {suggestions.map(s => (
        <li key={s.url || s.title}>
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
        </li>
      ))}
    </ul>
  );
}
