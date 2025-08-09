import React from 'react';

export default function DeckSidebar({ decks, current, onSelect }) {
  return (
    <aside className="w-40 border-r pr-2 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100">
      <h2 className="font-semibold mb-2">Decks</h2>
      <ul className="space-y-1">
        <li className={current === null ? 'font-bold' : ''}>
          <button
            onClick={() => onSelect(null)}
            className="w-full text-left rounded px-1 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            All
          </button>
        </li>
        {Object.entries(decks).map(([d, count]) => (
          <li key={d} className={current === d ? 'font-bold' : ''}>
            <button
              onClick={() => onSelect(d)}
              className="w-full text-left rounded px-1 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {d} ({count})
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
