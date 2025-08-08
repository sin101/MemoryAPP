import React, { useMemo } from 'react';
import ReactFlow, { Background } from 'reactflow';
import 'reactflow/dist/style.css';

export default function GraphView({ cards, links }) {
  const nodes = useMemo(() =>
    cards.map(c => ({ id: c.id, position: { x: Math.random()*400, y: Math.random()*400 }, data: { label: c.title } })),
    [cards]
  );
  const edges = useMemo(() =>
    (links || []).map(l => ({ id: l.id, source: l.from, target: l.to })),
    [links]
  );
  return (
    <div style={{ width: '100%', height: 400 }}>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
      </ReactFlow>
    </div>
  );
}
