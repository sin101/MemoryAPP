import React, { useEffect, useRef } from 'react';
import { tagColor } from '../tagColors';

const TYPE_ICONS = {
  text: '📝', image: '🖼️', link: '🔗', file: '📁',
  video: '🎬', audio: '🎤', youtube: '▶', tweet: '𝕏', article: '📰',
};

const YouTubeEmbed = React.memo(function YouTubeEmbed({ videoId, title }) {
  return (
    <div className="relative w-full" style={{ paddingBottom: '56.25%', height: 0 }}>
      <iframe
        className="absolute inset-0 w-full h-full rounded-lg"
        src={`https://www.youtube.com/embed/${videoId}?autoplay=0`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
});

export default function CardDetailModal({ card, onClose, onEdit, onDelete }) {
  const backdropRef = useRef(null);
  // Use a ref so the effect never needs to re-register when onClose identity changes
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []); // stable — never re-registers

  if (!card) return null;

  const handleBackdrop = e => { if (e.target === backdropRef.current) onClose(); };

  const domain = card.source
    ? (() => { try { return new URL(card.source).hostname.replace(/^www\./, ''); } catch { return null; } })()
    : null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition text-sm font-bold"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Media area */}
        <div className="rounded-t-2xl overflow-hidden">
          {card.type === 'youtube' && card.content && (
            <YouTubeEmbed videoId={card.content} title={card.title} />
          )}
          {card.type === 'image' && (card.image || card.illustration) && (
            <img src={card.image || card.illustration} alt={card.title} className="w-full max-h-72 object-contain bg-gray-100 dark:bg-gray-800" />
          )}
          {card.type !== 'image' && card.type !== 'youtube' && card.illustration && (
            <div className="relative">
              <img src={card.illustration} alt="" className="w-full max-h-56 object-cover" onError={e => { e.currentTarget.parentElement.style.display = 'none'; }} />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/80 dark:to-gray-900/80" />
            </div>
          )}
          {card.type === 'audio' && card.audio && (
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 flex flex-col items-center gap-3">
              <span className="text-5xl">🎵</span>
              <audio src={card.audio} controls className="w-full max-w-sm" />
              {typeof card.duration === 'number' && card.duration > 0 && (
                <p className="text-white/80 text-xs">{Math.floor(card.duration / 60)}:{String(Math.floor(card.duration % 60)).padStart(2, '0')}</p>
              )}
            </div>
          )}
          {card.type === 'video' && card.video && (
            <video src={card.video} controls className="w-full max-h-64 bg-black" />
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          <div className="flex items-start gap-2 mb-3">
            <span className="text-xl shrink-0 mt-0.5">{TYPE_ICONS[card.type] || '📝'}</span>
            <h2 className="text-xl font-bold leading-tight text-gray-900 dark:text-gray-100">{card.title}</h2>
          </div>

          {domain && card.source && (
            <a href={card.source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline mb-3">
              <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" className="w-3.5 h-3.5" onError={e => { e.currentTarget.style.display = 'none'; }} />
              {domain}
            </a>
          )}

          {card.summary && card.summary !== card.title && (
            <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-l-4 border-blue-400">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wide">Summary</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{card.summary}</p>
            </div>
          )}

          {card.description && card.description !== card.summary && (
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-3 whitespace-pre-wrap">{card.description}</p>
          )}

          {card.content && !['youtube', 'audio', 'video'].includes(card.type) && card.content !== card.description && (
            <details className="mb-3">
              <summary className="text-xs font-semibold text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 uppercase tracking-wide select-none">
                Full content ▾
              </summary>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                {card.content}
              </p>
            </details>
          )}

          {card.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {card.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 text-xs rounded-full text-gray-700 dark:text-gray-200 font-medium" style={{ backgroundColor: tagColor(tag) }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {card.decks?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {card.decks.map(deck => (
                <span key={deck} className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-medium">
                  🗂 {deck}
                </span>
              ))}
            </div>
          )}

          {card.createdAt && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Added {new Date(card.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          )}

          <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => { onEdit(card); onClose(); }}
              className="flex-1 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
            >
              ✏️ Edit
            </button>
            <button
              onClick={() => { onDelete(card.id); onClose(); }}
              className="py-2 px-4 rounded-lg text-sm font-medium border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition text-red-600 dark:text-red-400"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
