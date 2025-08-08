import React, { useState, useRef } from 'react';

export default function QuickAdd({ onAdd, initial }) {
  const [text, setText] = useState(initial || '');
  React.useEffect(() => { setText(initial || ''); }, [initial]);
  const fileRef = useRef();

  const submit = () => {
    if (text.trim()) {
      onAdd({ title: text.slice(0, 20), content: text });
      setText('');
    }
  };

  const handleDrop = e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      onAdd({ title: file.name, source: file.name, type: file.type.startsWith('image/') ? 'image' : 'file' });
    }
  };

  const handlePaste = e => {
    const item = e.clipboardData.items[0];
    if (item && item.kind === 'file') {
      const file = item.getAsFile();
      onAdd({ title: file.name, source: file.name, type: file.type.startsWith('image/') ? 'image' : 'file' });
    }
  };

  const handleFile = e => {
    const file = e.target.files[0];
    if (file) {
      onAdd({ title: file.name, source: file.name, type: file.type.startsWith('image/') ? 'image' : 'file' });
      fileRef.current.value = '';
    }
  };

  return (
    <div
      className="border p-2 mb-4"
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      onPaste={handlePaste}
    >
      <textarea
        className="border p-2 w-full mb-2"
        placeholder="Quick add..."
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div className="flex space-x-2">
        <button className="bg-blue-500 text-white px-3 py-1" onClick={submit}>Add</button>
        <input ref={fileRef} type="file" onChange={handleFile} />
      </div>
    </div>
  );
}
