import React, { useCallback, useMemo, useState } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import { tagColor } from '../tagColors';
import Modal from './Modal';

export default function GraphView({ cards, links, onLink, onLinkEdit, cardBg, cardBorder }) {
  const [deckFilter, setDeckFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [linkFilter, setLinkFilter] = useState('');
  const [modalData, setModalData] = useState(null);
  const [positions, setPositions] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('graph-positions') || '{}');
    } catch {
      return {};
    }
  });

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
        position: positions[c.id] || { x: Math.random() * 400, y: Math.random() * 400 },
        data: {
          label: `${c.title}${c.decks?.length > 1 ? ' 🔁' : ''}`,
        },
        style: {
          border: `2px solid ${c.tags[0] ? tagColor(c.tags[0]) : cardBorder}`,
          padding: 10,
          borderRadius: 8,
          background: cardBg
        }
      })),
    [filtered, cardBg, cardBorder, positions]
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
      setModalData({ mode: 'add', source: params.source, target: params.target, type: 'related', annotation: '' });
    },
    []
  );

  const handleEdgeClick = useCallback(
    (_, edge) => {
      setModalData({
        mode: 'edit',
        edgeId: edge.id,
        type: edge.data?.type || edge.label || '',
        annotation: edge.data?.annotation || ''
      });
    },
    []
  );

  const handleModalSave = () => {
    if (!modalData) return;
    if (modalData.mode === 'add' && onLink) {
      onLink(modalData.source, modalData.target, modalData.type, modalData.annotation);
    }
    if (modalData.mode === 'edit' && onLinkEdit) {
      onLinkEdit(modalData.edgeId, modalData.type, modalData.annotation);
    }
    setModalData(null);
  };

  const deckOptions = Array.from(new Set(cards.flatMap(c => c.decks || [])));
  const tagOptions = Array.from(new Set(cards.flatMap(c => c.tags || [])));
  const linkTypeOptions = Array.from(new Set((links || []).map(l => l.type).filter(Boolean)));

  const handleNodesChange = useCallback(changes => {
    setPositions(pos => {
      const next = { ...pos };
      changes.forEach(ch => {
        if (ch.type === 'position' && ch.position) {
          next[ch.id] = ch.position;
        }
      });
      localStorage.setItem('graph-positions', JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <div>
      <div className="flex space-x-2 mb-2">
        <select
          value={deckFilter}
          onChange={e => setDeckFilter(e.target.value)}
          className="border px-2 bg-white dark:bg-gray-800"
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
          className="border px-2 bg-white dark:bg-gray-800"
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
          className="border px-2 bg-white dark:bg-gray-800"
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
          onNodesChange={handleNodesChange}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      {modalData && (
        <Modal
          title={modalData.mode === 'add' ? 'Create Link' : 'Edit Link'}
          onClose={() => setModalData(null)}
        >
          <form
            onSubmit={e => {
              e.preventDefault();
              handleModalSave();
            }}
          >
            <label className="block mb-2">
              <span className="block mb-1">Link type</span>
              <input
                className="border px-2 w-full bg-white dark:bg-gray-700"
                value={modalData.type}
                onChange={e => setModalData(d => ({ ...d, type: e.target.value }))}
                autoFocus
              />
            </label>
            <label className="block mb-2">
              <span className="block mb-1">Annotation</span>
              <input
                className="border px-2 w-full bg-white dark:bg-gray-700"
                value={modalData.annotation}
                onChange={e => setModalData(d => ({ ...d, annotation: e.target.value }))}
              />
            </label>
            <div className="flex justify-end space-x-2 mt-4">
              <button type="button" className="border px-3 py-1" onClick={() => setModalData(null)}>
                Cancel
              </button>
              <button type="submit" className="bg-blue-500 text-white px-3 py-1">
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
