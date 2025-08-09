import React, { useCallback, useMemo, useState } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import { tagColor } from '../tagColors';

export default function GraphView({ cards, links, onLink, onLinkEdit, tagPalette }) {
  const [deckFilter, setDeckFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [linkFilter, setLinkFilter] = useState('');

  const filtered = useMemo(
    () =>
      cards.filter(
        c =>
          (!deckFilter || c.decks?.includes(deckFilter)) &&
          (!tagFilter || c.tags.includes(tagFilter))
      ),
    [cards, deckFilter, tagFilter]
  );

  const nodes = useMemo(
    () =>
      filtered.map(c => ({
        id: c.id,
        position: { x: Math.random() * 400, y: Math.random() * 400 },
        data: {
          label: `${c.title}${c.decks?.length > 1 ? ' 🔁' : ''}`,
        },
        style: {
          border: `2px solid ${c.tags[0] ? tagColor(c.tags[0], tagPalette) : '#d1d5db'}`,
          padding: 10,
          borderRadius: 8,
          background: '#fff'
        }
      })),
    [filtered, tagPalette]
  );
  const edges = useMemo(
    () =>
      (links || [])
        .filter(
          l =>
            (!linkFilter || l.type === linkFilter) &&
            filtered.some(c => c.id === l.from) &&
            filtered.some(c => c.id === l.to)
        )
        .map(l => ({ id: l.id, source: l.from, target: l.to, label: l.annotation || l.type, data: { type: l.type, annotation: l.annotation } })),
    [links, filtered, linkFilter]
  );

  const handleConnect = useCallback(
    params => {
      const type = prompt('Link type (e.g., inspires, completes)', 'related');
      if (!type) return;
      const annotation = prompt('Annotation');
      if (onLink) {
        onLink(params.source, params.target, type, annotation);
      }
    },
    [onLink]
  );

  const handleEdgeClick = useCallback(
    (_, edge) => {
      const type = prompt('Edit link type', edge.data?.type || edge.label || '');
      if (type === null) return;
      const annotation = prompt('Edit annotation', edge.data?.annotation || '');
      if (annotation !== null && onLinkEdit) {
        onLinkEdit(edge.id, type, annotation);
      }
    },
    [onLinkEdit]
  );

  const deckOptions = Array.from(new Set(cards.flatMap(c => c.decks || [])));
  const tagOptions = Array.from(new Set(cards.flatMap(c => c.tags || [])));
  const linkTypeOptions = Array.from(new Set((links || []).map(l => l.type).filter(Boolean)));

  return (
    <div>
      <div className="flex space-x-2 mb-2">
        <select
          value={deckFilter}
          onChange={e => setDeckFilter(e.target.value)}
          className="border px-2"
        >
          <option value="">All Decks</option>
          {deckOptions.map(d => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          className="border px-2"
        >
          <option value="">All Tags</option>
          {tagOptions.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={linkFilter}
          onChange={e => setLinkFilter(e.target.value)}
          className="border px-2"
        >
          <option value="">All Link Types</option>
          {linkTypeOptions.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div style={{ width: '100%', height: 400 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onConnect={handleConnect}
          onEdgeClick={handleEdgeClick}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
