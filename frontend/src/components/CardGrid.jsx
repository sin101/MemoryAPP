import React, { useEffect, useRef, useState } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import { tagColor } from '../tagColors';

const typeIcons = {
  text:    '📝',
  image:   '🖼️',
  link:    '🔗',
  file:    '📁',
  video:   '🎬',
  audio:   '🎤',
  youtube: '▶',
  tweet:   '𝕏',
  article: '📰',
};

function YouTubeEmbed({ videoId, title }) {
  const [playing, setPlaying] = useState(false);
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  if (playing) {
    return (
      <div className="mb-2 relative" style={{ paddingBottom: '56.25%', height: 0 }}>
        <iframe
          className="absolute inset-0 w-full h-full rounded"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onClick={e => e.stopPropagation()}
        />
      </div>
    );
  }
  return (
    <div
      className="relative mb-2 rounded overflow-hidden cursor-pointer"
      onClick={e => { e.stopPropagation(); setPlaying(true); }}
      title="Play video"
    >
      <img
        src={thumbnailUrl}
        alt={title}
        className="w-full h-32 object-cover"
        onError={e => { e.currentTarget.style.display = 'none'; }}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition">
        <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
          <span className="text-white text-xl ml-1">▶</span>
        </div>
      </div>
    </div>
  );
}

function TweetCard({ card }) {
  const domain = card.source
    ? new URL(card.source).hostname.replace(/^www\./, '')
    : 'x.com';
  return (
    <a
      href={card.source}
      target="_blank"
      rel="noopener noreferrer"
      className="block mb-2 border border-sky-200 dark:border-sky-700 rounded-xl p-3 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition no-underline"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-bold text-sky-600 dark:text-sky-400">𝕏</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{domain}</span>
      </div>
      {card.description && (
        <p className="text-sm line-clamp-4 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
          {card.description}
        </p>
      )}
    </a>
  );
}

function ArticleCard({ card }) {
  const domain = card.source
    ? (() => { try { return new URL(card.source).hostname.replace(/^www\./, ''); } catch { return ''; } })()
    : '';
  return (
    <a
      href={card.source}
      target="_blank"
      rel="noopener noreferrer"
      className="block mb-2 no-underline"
      onClick={e => e.stopPropagation()}
    >
      {card.illustration && (
        <img
          src={card.illustration}
          alt=""
          className="w-full h-28 object-cover rounded-lg mb-1"
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      {domain && (
        <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mb-0.5">
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
            alt=""
            className="w-3 h-3"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
          {domain}
        </p>
      )}
    </a>
  );
}

function LinkCard({ card }) {
  const domain = card.source
    ? (() => { try { return new URL(card.source).hostname.replace(/^www\./, ''); } catch { return card.source; } })()
    : '';
  return (
    <a
      href={card.source}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mb-2 text-blue-600 dark:text-blue-400 hover:underline text-xs no-underline"
      onClick={e => e.stopPropagation()}
    >
      {domain && (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
          alt=""
          className="w-3 h-3 shrink-0"
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      <span className="truncate">{domain || card.source}</span>
    </a>
  );
}

export default function CardGrid({ cards, onSelect, onEdit, onDelete, cardBg, cardBorder, highlight }) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ width: 0, height: 0, columnCount: 1 });

  useEffect(() => {
    let rafId = null;
    function measure() {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      if (!width) {
        // Layout not ready — retry on next animation frame
        rafId = requestAnimationFrame(measure);
        return;
      }
      const columnCount = width >= 768 ? 3 : width >= 640 ? 2 : 1;
      const rect = containerRef.current.getBoundingClientRect();
      const height = Math.max(500, window.innerHeight - rect.top - 16);
      setDims({ width, height, columnCount });
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const rowCount = Math.ceil(cards.length / dims.columnCount);
  const columnWidth = dims.columnCount ? dims.width / dims.columnCount : dims.width;
  const rowHeight = 280;

  const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const highlightText = (text, q) => {
    if (!q) return text;
    const regex = new RegExp(`(${escapeRegExp(q)})`, 'ig');
    const parts = String(text).split(regex);
    return parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part));
  };

  const itemData = { cards, columnCount: dims.columnCount, onSelect, onEdit, onDelete, cardBg, cardBorder, highlight, highlightText };

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
            borderColor: (card.tags?.[0]) ? tagColor(card.tags[0]) : data.cardBorder,
          }}
          onClick={() => data.onSelect(card)}
          role="button"
          tabIndex={0}
          aria-label={`View ${card.title}`}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              data.onSelect(card);
            }
          }}
        >
          <div className="absolute top-1 right-1 space-x-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              aria-label={`Edit ${card.title}`}
              onClick={e => {
                e.stopPropagation();
                data.onEdit && data.onEdit(card);
              }}
              className="text-xs"
            >
              ✏️
            </button>
            <button
              aria-label={`Delete ${card.title}`}
              onClick={e => {
                e.stopPropagation();
                data.onDelete && data.onDelete(card.id);
              }}
              className="text-xs"
            >
              🗑️
            </button>
          </div>
          <h3 className="text-base font-semibold mb-2 flex items-center gap-1 leading-tight">
            <span>{typeIcons[card.type || 'text'] || '📝'}</span>
            <span className="line-clamp-2">{data.highlightText(card.title, data.highlight)}</span>
          </h3>

          {/* YouTube */}
          {card.type === 'youtube' && card.content && (
            <YouTubeEmbed videoId={card.content} title={card.title} />
          )}

          {/* Tweet */}
          {card.type === 'tweet' && (
            <TweetCard card={card} />
          )}

          {/* Article */}
          {card.type === 'article' && (
            <ArticleCard card={card} />
          )}

          {/* Generic link */}
          {card.type === 'link' && card.source && (
            <LinkCard card={card} />
          )}

          {/* Uploaded image */}
          {card.type === 'image' && (card.image || card.illustration) && (
            <img src={card.image || card.illustration} alt={card.title} className="mb-2 max-h-32 rounded object-cover w-full" />
          )}

          {/* Illustration — shown for all types that don't have a dedicated visual */}
          {card.illustration && !['youtube', 'tweet'].includes(card.type) && !(card.type === 'image' && (card.image || card.illustration === card.image)) && (
            <img
              src={card.illustration}
              alt="illustration"
              className="mb-2 max-h-24 rounded object-cover w-full"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          )}

          {/* Uploaded video */}
          {card.type === 'video' && card.video && (
            <video src={card.video} controls className="mb-2 max-h-32 rounded w-full" onClick={e => e.stopPropagation()} />
          )}

          {/* Audio */}
          {card.type === 'audio' && card.audio && (
            <div className="mb-2">
              <audio src={card.audio} controls className="w-full" onClick={e => e.stopPropagation()} />
              {card.contentType && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{card.contentType}</p>
              )}
              {typeof card.duration === 'number' && card.duration > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{card.duration.toFixed(1)}s</p>
              )}
            </div>
          )}

          {/* Description / excerpt */}
          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
            {data.highlightText(card.description || card.summary || '', data.highlight)}
          </p>
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
    <div ref={containerRef} className="w-full">
      {!cards.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <span className="text-4xl mb-3">🗂</span>
          <p className="text-sm">No cards found</p>
          <p className="text-xs mt-1">Try clearing your search or deck filter</p>
        </div>
      ) : dims.width > 0 && dims.height > 0 ? (
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
      ) : null}
    </div>
  );
}

