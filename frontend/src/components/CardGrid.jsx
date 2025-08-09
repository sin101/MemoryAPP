import React, { useEffect, useRef, useState } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import { tagColor } from '../tagColors';

const typeIcons = {
  text: '📝',
  image: '🖼️',
  link: '🔗',
  file: '📁',
  video: '🎬',
  audio: '🎤',
};

export default function CardGrid({ cards, onSelect, onEdit, onDelete, cardBg, cardBorder }) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ width: 0, height: 0, columnCount: 1 });

  useEffect(() => {
    function handleResize() {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const columnCount = width >= 768 ? 3 : width >= 640 ? 2 : 1;
      const height = window.innerHeight - containerRef.current.getBoundingClientRect().top - 20;
      setDims({ width, height, columnCount });
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!cards.length) {
    return <p className="text-gray-500 dark:text-gray-400">No cards found</p>;
  }

  const rowCount = Math.ceil(cards.length / dims.columnCount);
  const columnWidth = dims.columnCount ? dims.width / dims.columnCount : dims.width;
  const rowHeight = 360;

  const itemData = { cards, columnCount: dims.columnCount, onSelect, onEdit, onDelete, cardBg, cardBorder };

  const Cell = ({ columnIndex, rowIndex, style, data }) => {
    const index = rowIndex * data.columnCount + columnIndex;
    if (index >= data.cards.length) return null;
    const card = data.cards[index];
    return (
      <div style={{ ...style, padding: 8 }}>
        <div
          className="group relative border-4 p-4 rounded-xl cursor-pointer shadow-md hover:shadow-xl transform hover:-translate-y-1 hover:scale-105 transition bg-white dark:bg-gray-800 dark:text-white"
          style={{
            backgroundColor: data.cardBg,
            borderColor: card.tags[0] ? tagColor(card.tags[0]) : data.cardBorder,
          }}
          onClick={() => data.onSelect(card)}
        >
          <div className="absolute top-1 right-1 space-x-1 opacity-0 group-hover:opacity-100">
            <button onClick={e => { e.stopPropagation(); data.onEdit && data.onEdit(card); }} className="text-xs">✏️</button>
            <button onClick={e => { e.stopPropagation(); data.onDelete && data.onDelete(card.id); }} className="text-xs">🗑️</button>
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
          {card.type === 'audio' && card.audio && (
            <div className="mb-2">
              <audio src={card.audio} controls className="w-full" />
              {card.contentType && (
                <p className="text-sm text-gray-600 dark:text-gray-400">Format: {card.contentType}</p>
              )}
              {typeof card.duration === 'number' && card.duration > 0 && (
                <p className="text-sm text-gray-600 dark:text-gray-400">Duration: {card.duration.toFixed(1)}s</p>
              )}
            </div>
          )}
          <p>{card.description}</p>
          {card.summary && (
            <p className="text-sm text-gray-600 dark:text-gray-400">{card.summary}</p>
          )}
          {card.createdAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {new Date(card.createdAt).toLocaleDateString()}
            </p>
          )}
          <div className="mt-2 space-x-1">
            {card.tags.map(tag => (
              <span
                key={tag}
                className="inline-block px-2 py-1 text-xs rounded text-gray-700 dark:text-gray-200"
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
                  className="inline-block bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-1 text-xs rounded"
                >
                  {deck}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="w-full h-full">
      {dims.height > 0 && (
        <Grid
          columnCount={dims.columnCount}
          columnWidth={columnWidth}
          height={dims.height}
          rowCount={rowCount}
          rowHeight={rowHeight}
          itemData={itemData}
          width={dims.width}
        >
          {Cell}
        </Grid>
      )}
    </div>
  );
}

