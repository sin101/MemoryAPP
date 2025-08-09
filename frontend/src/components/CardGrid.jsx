import React from 'react';
import { tagColor } from '../tagColors';

const typeIcons = {
  text: '📝',
  image: '🖼️',
  link: '🔗',
  file: '📁',
  video: '🎬',
};

export default function CardGrid({ cards, onSelect, onEdit, onDelete }) {
  if (!cards.length) {
    return <p className="text-gray-500">No cards found</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {cards.map(card => (
        <div
          key={card.id}
          className="group relative bg-white border-4 p-4 rounded-xl cursor-pointer shadow-md hover:shadow-xl transform hover:-translate-y-1 hover:scale-105 transition"
          style={{ borderColor: card.tags[0] ? tagColor(card.tags[0]) : '#d1d5db' }}
          onClick={() => onSelect(card)}
        >
          <div className="absolute top-1 right-1 space-x-1 opacity-0 group-hover:opacity-100">
            <button onClick={e => { e.stopPropagation(); onEdit && onEdit(card); }} className="text-xs">✏️</button>
            <button onClick={e => { e.stopPropagation(); onDelete && onDelete(card.id); }} className="text-xs">🗑️</button>
          </div>
          <h3 className="text-lg font-semibold mb-2 flex items-center">
            <span className="mr-1">{typeIcons[card.contentType || card.type || 'text'] || '📝'}</span>
            {card.title}
          </h3>
          {card.illustration && (
            <img src={card.illustration} alt="illustration" className="mb-2" />
          )}
          {!card.illustration && card.image && (
            <img src={card.image} alt="illustration" className="mb-2" />
          )}
          {card.type === 'video' && card.video && (
            <video src={card.video} controls className="mb-2" />
          )}
          <p>{card.description}</p>
          {card.summary && <p className="text-sm text-gray-600">{card.summary}</p>}
          {card.createdAt && (
            <p className="text-xs text-gray-500 mt-1">
              {new Date(card.createdAt).toLocaleDateString()}
            </p>
          )}
          <div className="mt-2 space-x-1">
            {card.tags.map(tag => (
              <span
                key={tag}
                className="inline-block px-2 py-1 text-xs rounded text-gray-700"
                style={{ backgroundColor: tagColor(tag) }}
              >
                {tag}
              </span>
            ))}
          </div>
          {card.decks && card.decks.length > 0 && (
            <div className="mt-2 space-x-1">
              {card.decks.map(deck => (
                <span
                  key={deck}
                  className="inline-block bg-blue-100 text-blue-700 px-2 py-1 text-xs rounded"
                >
                  {deck}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
