import React from 'react';

export default function DeckSidebar({ decks, current, onSelect }) {
  const items = [['All', null], ...Object.entries(decks)];

  return (
    <aside className="w-48 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col pt-3 px-2 pb-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-2 mb-2">Decks</p>
      <ul className="space-y-0.5 flex-1 overflow-y-auto">
        {items.map(([label, value]) => {
          const isActive = current === value;
          return (
            <li key={String(value)}>
              <button
                onClick={() => onSelect(value)}
                className={`w-full text-left rounded-lg px-3 py-1.5 text-sm flex items-center justify-between transition
                  ${isActive
                    ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
              >
                <span className="truncate">{label === 'All' ? '📋 All' : `🗂 ${label}`}</span>
                {value !== null && (
                  <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">{decks[label]}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
