import React, { useCallback, useMemo, useState } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

export default function GraphView({ cards, links, onLink }) {
  const [deckFilter, setDeckFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

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
        data: { label: `${c.title}${c.decks?.length ? ` [${c.decks.length}]` : ''}` },
      })),
    [filtered]
  );
  const edges = useMemo(
    () =>
      (links || [])
        .filter(l => filtered.some(c => c.id === l.from) && filtered.some(c => c.id === l.to))
        .map(l => ({ id: l.id, source: l.from, target: l.to })),
    [links, filtered]
  );

  const handleConnect = useCallback(
    params => {
      onLink && onLink(params.source, params.target);
    },
    [onLink]
  );

  const deckOptions = Array.from(new Set(cards.flatMap(c => c.decks || [])));
  const tagOptions = Array.from(new Set(cards.flatMap(c => c.tags || [])));

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
      </div>
      <div style={{ width: '100%', height: 400 }}>
        <ReactFlow nodes={nodes} edges={edges} onConnect={handleConnect} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
