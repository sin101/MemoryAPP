import React from 'react';

export default function DeckSidebar({ decks, current, onSelect }) {
  return (
    <aside className="w-40 border-r pr-2">
      <h2 className="font-semibold mb-2">Decks</h2>
      <ul className="space-y-1">
        <li className={current === null ? 'font-bold' : ''}>
          <button onClick={() => onSelect(null)}>All</button>
        </li>
        {decks.map(d => (
          <li key={d} className={current === d ? 'font-bold' : ''}>
            <button onClick={() => onSelect(d)}>{d}</button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
