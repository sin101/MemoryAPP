import React, { useState, useRef } from 'react';

export default function QuickAdd({ onAdd, initial }) {
  const [text, setText] = useState(initial || '');
  const [decksInput, setDecksInput] = useState('');
  const [pending, setPending] = useState(null);
  React.useEffect(() => {
    setText(initial || '');
  }, [initial]);
  const fileRef = useRef();

  const parseDecks = input =>
    input
      .split(',')
      .map(d => d.trim())
      .filter(Boolean);

  const previewText = () => {
    if (text.trim()) {
      setPending({
        title: text.slice(0, 20),
        description: text,
        type: 'text',
        decks: parseDecks(decksInput),
      });
    }
  };

  const prepareFile = file => {
    setPending({
      title: file.name,
      source: file.name,
      type: file.type.startsWith('image/') ? 'image' : 'file',
      decks: parseDecks(decksInput),
    });
  };

  const handleDrop = e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      prepareFile(file);
    }
  };

  const handlePaste = e => {
    const item = e.clipboardData.items[0];
    if (item && item.kind === 'file') {
      const file = item.getAsFile();
      prepareFile(file);
    }
  };

  const handleFile = e => {
    const file = e.target.files[0];
    if (file) {
      prepareFile(file);
      fileRef.current.value = '';
    }
  };

  const save = () => {
    if (pending) {
      onAdd(pending);
      setPending(null);
      setText('');
      setDecksInput('');
    }
  };

  const cancel = () => {
    setPending(null);
  };

  if (pending) {
    return (
      <div className="border p-2 mb-4">
        <h4 className="font-semibold mb-2">Preview</h4>
        {pending.type === 'image' ? (
          <p>{pending.title}</p>
        ) : (
          <p className="whitespace-pre-wrap">{pending.description}</p>
        )}
        <div className="mt-2 space-x-2">
          <button
            className="bg-blue-500 text-white px-3 py-1"
            onClick={save}
          >
            Save
          </button>
          <button className="px-3 py-1 border" onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

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
      <input
        className="border p-2 w-full mb-2"
        placeholder="Decks (comma separated)"
        value={decksInput}
        onChange={e => setDecksInput(e.target.value)}
      />
      <div className="flex space-x-2">
        <button
          className="bg-blue-500 text-white px-3 py-1"
          onClick={previewText}
        >
          Preview
        </button>
        <input ref={fileRef} type="file" onChange={handleFile} />
      </div>
    </div>
  );
}
