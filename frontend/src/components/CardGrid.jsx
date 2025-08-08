import React from 'react';

const tagStyles = {
  demo: 'border-red-300',
  sample: 'border-yellow-300',
  javascript: 'border-green-300',
  code: 'border-blue-300'
};

export default function CardGrid({ cards, onSelect, onEdit, onDelete, onFav }) {
  if (!cards.length) {
    return <p className="text-gray-500">No cards found</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {cards.map(card => (
        <div
          key={card.id}
          className={`group border p-4 rounded cursor-pointer hover:shadow-lg relative ${tagStyles[card.tags[0]?.toLowerCase()] || 'border-gray-300'}`}
          onClick={() => onSelect(card)}
        >
          <div className="absolute top-1 right-1 space-x-1 opacity-0 group-hover:opacity-100">
            <button onClick={e => { e.stopPropagation(); onEdit && onEdit(card); }} className="text-xs">✏️</button>
            <button onClick={e => { e.stopPropagation(); onDelete && onDelete(card.id); }} className="text-xs">🗑️</button>
            <button onClick={e => { e.stopPropagation(); onFav && onFav(card); }} className="text-xs">⭐</button>
          </div>
          <h3 className="text-lg font-semibold mb-2">{card.title}</h3>
          {card.image && <img src={card.image} alt="illustration" className="mb-2" />}
          <p>{card.description}</p>
          {card.summary && <p className="text-sm text-gray-600">{card.summary}</p>}
          <div className="mt-2 space-x-1">
            {card.tags.map(tag => (
              <span
                key={tag}
                className="inline-block bg-gray-200 text-gray-700 px-2 py-1 text-xs rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
