import React, { useState, useRef } from 'react';

export default function QuickAdd({ onAdd, initial, aiEnabled }) {
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

  const previewText = async () => {
    if (text.trim()) {
      const data = {
        title: text.slice(0, 20),
        description: text,
        type: 'text',
        decks: parseDecks(decksInput),
      };
        if (aiEnabled) {
          try {
            const res = await fetch('/api/illustrate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: text })
            });
            const json = await res.json();
            if (json.image) {
              data.illustration = json.image;
            }
          } catch (e) {
            console.error(e);
          }
        }
      setPending(data);
    }
  };

  const prepareFile = file => {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    const reader = new FileReader();
    reader.onload = () => {
      setPending({
        title: file.name,
        source: file.name,
        type: isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'file',
        decks: parseDecks(decksInput),
        image: isImage ? reader.result : undefined,
        video: isVideo ? reader.result : undefined,
        audio: isAudio ? reader.result : undefined,
      });
    };
    reader.readAsDataURL(file);
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

  const save = async () => {
    if (!pending) return;
    if (pending.type === 'video' && pending.video) {
      const base64 = pending.video.split(',')[1];
      try {
        const res = await fetch('/api/video-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: pending.title, video: base64 })
        });
        const card = await res.json();
        onAdd({ ...card, video: pending.video });
      } catch (e) {
        console.error(e);
      }
    } else if (pending.type === 'audio' && pending.audio) {
      const base64 = pending.audio.split(',')[1];
      try {
        const res = await fetch('/api/audio-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: pending.title, audio: base64 })
        });
        const card = await res.json();
        onAdd({ ...card, audio: pending.audio });
      } catch (e) {
        console.error(e);
      }
    } else if (pending.type === 'text') {
      try {
        const res = await fetch('/api/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pending)
        });
        const card = await res.json();
        onAdd(card);
      } catch (e) {
        console.error(e);
        onAdd(pending);
      }
    } else {
      onAdd(pending);
    }
    setPending(null);
    setText('');
    setDecksInput('');
  };

  const cancel = () => {
    setPending(null);
  };

  if (pending) {
    return (
      <div className="border p-2 mb-4">
        <h4 className="font-semibold mb-2">Preview</h4>
        {pending.type === 'image' && pending.image && (
          <img src={pending.image} alt={pending.title} className="mb-2 max-h-40" />
        )}
        {pending.type === 'video' && pending.video && (
          <video src={pending.video} controls className="mb-2 max-h-40" />
        )}
        {pending.type === 'audio' && pending.audio && (
          <audio src={pending.audio} controls className="mb-2 w-full" />
        )}
        {pending.type === 'text' && pending.illustration && (
          <img src={pending.illustration} alt="illustration" className="mb-2 max-h-40" />
        )}
        {(pending.type === 'file' || pending.type === 'text') && (
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
        <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" onChange={handleFile} />
      </div>
    </div>
  );
}
