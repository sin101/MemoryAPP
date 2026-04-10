import React, { memo, useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { tagColor } from '../tagColors';

const typeIcons = {
  text: '📝', image: '🖼️', link: '🔗', file: '📁',
  video: '🎬', audio: '🎤', youtube: '▶', tweet: '𝕏', article: '📰',
};

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function highlightText(text, q) {
  if (!q) return text;
  const parts = String(text).split(new RegExp(`(${escapeRegExp(q)})`, 'ig'));
  return parts.map((p, i) => i % 2 === 1 ? <mark key={i}>{p}</mark> : p);
}

// ── Compute shared-tag edges between visible cards ─────────────────────────
function computeEdges(cards) {
  const edges = [];
  for (let i = 0; i < cards.length; i++) {
    const tagsA = new Set(cards[i].tags || []);
    if (!tagsA.size) continue;
    for (let j = i + 1; j < cards.length; j++) {
      const shared = (cards[j].tags || []).filter(t => tagsA.has(t));
      if (shared.length > 0) edges.push({ from: i, to: j, shared, strength: shared.length });
    }
  }
  // Keep only strongest edges per card (max 3 connections each) to avoid clutter
  const connections = new Array(cards.length).fill(0);
  return edges
    .sort((a, b) => b.strength - a.strength)
    .filter(e => {
      if (connections[e.from] >= 3 || connections[e.to] >= 3) return false;
      connections[e.from]++;
      connections[e.to]++;
      return true;
    });
}

// ── Tooltip shown on hover ─────────────────────────────────────────────────
const CardTooltip = memo(function CardTooltip({ card, rect, containerRect }) {
  if (!card || !rect || !containerRect) return null;

  // Position tooltip above or below card
  const gap = 8;
  const tooltipW = 280;
  let left = rect.left - containerRect.left + rect.width / 2 - tooltipW / 2;
  left = Math.max(4, Math.min(left, containerRect.width - tooltipW - 4));
  const spaceAbove = rect.top - containerRect.top;
  const above = spaceAbove > 180;
  const top = above
    ? rect.top - containerRect.top - gap
    : rect.bottom - containerRect.top + gap;

  const domain = card.source
    ? (() => { try { return new URL(card.source).hostname.replace(/^www\./, ''); } catch { return null; } })()
    : null;

  return (
    <div
      className="absolute z-40 pointer-events-none"
      style={{ left, top, width: tooltipW, transform: above ? 'translateY(-100%)' : 'none' }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3 text-left">
        {/* Image preview */}
        {(card.image || card.illustration) && (
          <img
            src={card.image || card.illustration}
            alt=""
            className="w-full h-28 object-cover rounded-lg mb-2"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        )}

        {/* Title */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-sm">{typeIcons[card.type] || '📝'}</span>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight line-clamp-2">{card.title}</p>
        </div>

        {/* Source domain */}
        {domain && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1">
            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" className="w-3 h-3" onError={e => { e.currentTarget.style.display = 'none'; }} />
            {domain}
          </p>
        )}

        {/* Summary or description */}
        {(card.summary || card.description) && (
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3 mb-2">
            {card.summary || card.description}
          </p>
        )}

        {/* Tags — show top 10 visually; remainder are stored data points */}
        {card.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.tags.slice(0, 10).map(tag => (
              <span key={tag} className="px-1.5 py-0.5 text-xs rounded text-gray-700 dark:text-gray-200" style={{ backgroundColor: tagColor(tag) }}>
                {tag}
              </span>
            ))}
            {card.tags.length > 10 && (
              <span className="text-xs text-gray-400 dark:text-gray-500 self-center" title={card.tags.slice(10).join(', ')}>
                +{card.tags.length - 10} hidden
              </span>
            )}
          </div>
        )}

        {/* Date */}
        {card.createdAt && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
            {new Date(card.createdAt).toLocaleDateString()}
          </p>
        )}
      </div>
      {/* Arrow */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 rotate-45"
        style={above
          ? { bottom: -6, borderRight: '1px solid', borderBottom: '1px solid' }
          : { top: -6, borderLeft: '1px solid', borderTop: '1px solid' }}
      />
    </div>
  );
});

// ── Mini card ──────────────────────────────────────────────────────────────
const MiniCard = memo(function MiniCard({ card, cardBg, cardBorder, highlight, onSelect, onEdit, onDelete, onHover, isHovered, isRelated }) {
  const ref = useRef(null);
  const borderColor = card.tags?.[0] ? tagColor(card.tags[0]) : cardBorder;

  const handleMouseEnter = useCallback(() => {
    onHover(card, ref.current?.getBoundingClientRect() ?? null);
  }, [card, onHover]);
  const handleMouseLeave = useCallback(() => onHover(null, null), [onHover]);
  const handleEdit = useCallback(e => { e.stopPropagation(); onEdit?.(card); }, [card, onEdit]);
  const handleDelete = useCallback(e => { e.stopPropagation(); onDelete?.(card.id); }, [card.id, onDelete]);

  const hasVisual = card.image || card.illustration;
  // Border color from first tag
  return (
    <div
      ref={ref}
      className={[
        'group relative rounded-xl cursor-pointer transition-all duration-150 overflow-hidden select-none',
        'border-2 shadow-sm',
        isHovered ? 'shadow-xl scale-105 z-20' : 'hover:shadow-md hover:scale-102',
        isRelated ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-gray-900' : '',
      ].join(' ')}
      style={{ backgroundColor: cardBg, borderColor, minHeight: 80 }}
      onClick={() => onSelect(card)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      tabIndex={0}
      aria-label={`View ${card.title}`}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(card); } }}
    >
      {/* Image / illustration strip */}
      {hasVisual && (
        <div className="w-full h-20 overflow-hidden">
          <img
            src={card.image || card.illustration}
            alt=""
            className="w-full h-full object-cover"
            onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
          />
        </div>
      )}

      {/* Content */}
      <div className="p-2.5">
        {/* Type icon + title */}
        <div className="flex items-start gap-1 mb-1">
          <span className="text-xs shrink-0 mt-px">{typeIcons[card.type] || '📝'}</span>
          <p className="text-xs font-semibold leading-tight line-clamp-2 text-gray-900 dark:text-gray-100">
            {highlightText(card.title, highlight)}
          </p>
        </div>

        {/* Primary tag pill — show first two, indicate total */}
        <div className="flex items-center gap-1 flex-wrap">
          {card.tags?.slice(0, 2).map(tag => (
            <span key={tag} className="inline-block px-1.5 py-0.5 text-xs rounded text-gray-700 dark:text-gray-200 truncate max-w-[80px]" style={{ backgroundColor: tagColor(tag) }}>
              {tag}
            </span>
          ))}
          {card.tags?.length > 2 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">+{card.tags.length - 2}</span>
          )}
        </div>
      </div>

      {/* Edit/delete on hover */}
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={handleEdit} className="w-5 h-5 flex items-center justify-center rounded bg-white/80 dark:bg-gray-800/80 text-xs hover:bg-white dark:hover:bg-gray-700 shadow" aria-label={`Edit ${card.title}`}>✏️</button>
        <button onClick={handleDelete} className="w-5 h-5 flex items-center justify-center rounded bg-white/80 dark:bg-gray-800/80 text-xs hover:bg-white dark:hover:bg-gray-700 shadow" aria-label={`Delete ${card.title}`}>🗑️</button>
      </div>
    </div>
  );
});

// ── SVG relation lines overlay ─────────────────────────────────────────────
function RelationLines({ edges, cardRects, hoveredIndex, containerRect }) {
  if (!edges.length || !containerRect) return null;
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={containerRect.width}
      height={containerRect.height}
      style={{ zIndex: 10 }}
    >
      {edges.map((edge, i) => {
        const rA = cardRects[edge.from];
        const rB = cardRects[edge.to];
        if (!rA || !rB) return null;
        const x1 = rA.left - containerRect.left + rA.width / 2;
        const y1 = rA.top - containerRect.top + rA.height / 2;
        const x2 = rB.left - containerRect.left + rB.width / 2;
        const y2 = rB.top - containerRect.top + rB.height / 2;
        const isActive = hoveredIndex === edge.from || hoveredIndex === edge.to;
        const sharedColor = tagColor(edge.shared[0] || '');
        return (
          <line
            key={i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={isActive ? sharedColor : '#94a3b8'}
            strokeWidth={isActive ? 2 : 1}
            strokeDasharray={isActive ? 'none' : '4 4'}
            opacity={isActive ? 0.8 : 0.25}
          >
            {isActive && (
              <title>{edge.shared.join(', ')}</title>
            )}
          </line>
        );
      })}
    </svg>
  );
}

// ── Main CardGrid ──────────────────────────────────────────────────────────
function CardGrid({ cards, onSelect, onEdit, onDelete, cardBg, cardBorder, highlight }) {
  const containerRef = useRef(null);
  const [containerRect, setContainerRect] = useState(null);
  const [cardRects, setCardRects] = useState([]);
  const cardRefs = useRef([]);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [hoveredRect, setHoveredRect] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      setContainerRect(containerRef.current?.getBoundingClientRect() ?? null);
    });
    ro.observe(containerRef.current);
    setContainerRect(containerRef.current.getBoundingClientRect());
    return () => ro.disconnect();
  }, []);

  // Measure card positions after layout (for SVG lines)
  useEffect(() => {
    if (!containerRef.current) return;
    const measure = () => {
      const cr = containerRef.current?.getBoundingClientRect();
      if (!cr) return;
      setContainerRect(cr);
      setCardRects(cardRefs.current.map(el => el?.getBoundingClientRect() ?? null));
    };
    // Slight delay so grid is painted
    const id = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', measure); };
  }, [cards]);

  // Compute shared-tag edges (memoized on card ids + tags)
  const tagSignature = useMemo(() => cards.map(c => `${c.id}:${(c.tags || []).join(',')}`).join('|'), [cards]);
  const edges = useMemo(() => computeEdges(cards), [tagSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  // Which cards are related to the hovered card
  const relatedIndices = useMemo(() => {
    if (hoveredIndex < 0) return new Set();
    return new Set(edges.filter(e => e.from === hoveredIndex || e.to === hoveredIndex).flatMap(e => [e.from, e.to]));
  }, [edges, hoveredIndex]);

  const handleHover = useCallback((card, rect) => {
    setHoveredCard(card);
    setHoveredRect(rect);
    if (!card) { setHoveredIndex(-1); return; }
    const idx = cards.findIndex(c => c.id === card.id);
    setHoveredIndex(idx);
  }, [cards]);

  // Sync cardRefs array length
  useEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, cards.length);
  }, [cards.length]);

  if (!cards.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
        <span className="text-4xl mb-3">🗂</span>
        <p className="text-sm">No cards found</p>
        <p className="text-xs mt-1">Try clearing your search or deck filter</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full" style={{ minHeight: 120 }}>
      {/* SVG relation lines */}
      <RelationLines
        edges={edges}
        cardRects={cardRects}
        hoveredIndex={hoveredIndex}
        containerRect={containerRect}
      />

      {/* Card grid — CSS grid, no react-window, so we can measure card positions */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
      >
        {cards.map((card, idx) => (
          <div key={card.id} ref={el => { cardRefs.current[idx] = el; }}>
            <MiniCard
              card={card}
              cardBg={cardBg}
              cardBorder={cardBorder}
              highlight={highlight}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              onHover={handleHover}
              isHovered={hoveredIndex === idx}
              isRelated={relatedIndices.has(idx) && hoveredIndex !== idx}
            />
          </div>
        ))}
      </div>

      {/* Hover tooltip */}
      {hoveredCard && hoveredRect && containerRect && (
        <CardTooltip card={hoveredCard} rect={hoveredRect} containerRect={containerRect} />
      )}
    </div>
  );
}

export default memo(CardGrid);
