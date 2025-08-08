import React from 'react';

export default function CardGrid({ cards, onSelect }) {
  if (!cards.length) {
    return <p className="text-gray-500">No cards found</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {cards.map(card => (
        <div
          key={card.id}
          className="border p-4 rounded cursor-pointer hover:bg-gray-50"
          onClick={() => onSelect(card)}
        >
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
