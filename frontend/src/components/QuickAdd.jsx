import React, { useState, useRef } from 'react';

export default function QuickAdd({ onAdd, initial, aiEnabled }) {
  const [text, setText] = useState(initial || '');
  const [decksInput, setDecksInput] = useState('');
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
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
      setLoading(true);
      setError(null);
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
          setError('Failed to generate illustration.');
        }
      }
      setPending(data);
      setLoading(false);
    }
  };

  const prepareFile = file => {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    const reader = new FileReader();
    reader.onload = () => {
      const data = {
        title: file.name,
        source: file.name,
        type: isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'file',
        decks: parseDecks(decksInput),
        image: isImage ? reader.result : undefined,
        video: isVideo ? reader.result : undefined,
        audio: isAudio ? reader.result : undefined,
        contentType: file.type,
      };
      if (isAudio) {
        const audioEl = new Audio(reader.result);
        audioEl.onloadedmetadata = () => {
          data.duration = audioEl.duration;
          setPending(data);
        };
      } else {
        setPending(data);
      }
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
    setSaving(true);
    setError(null);
    try {
      if (pending.type === 'video' && pending.video) {
        const base64 = pending.video.split(',')[1];
        const res = await fetch('/api/video-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: pending.title, video: base64 })
        });
        const card = await res.json();
        onAdd({ ...card, video: pending.video });
      } else if (pending.type === 'audio' && pending.audio) {
        const base64 = pending.audio.split(',')[1];
        const res = await fetch('/api/audio-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: pending.title,
            audio: base64,
            contentType: pending.contentType,
            duration: pending.duration,
          })
        });
        const card = await res.json();
        onAdd({ ...card, audio: pending.audio });
      } else if (pending.type === 'text') {
        const res = await fetch('/api/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pending)
        });
        const card = await res.json();
        onAdd(card);
      } else {
        onAdd(pending);
      }
      setPending(null);
      setText('');
      setDecksInput('');
    } catch (e) {
      console.error(e);
      setError('Failed to save note.');
    } finally {
      setSaving(false);
    }
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
          <div className="mb-2">
            <audio src={pending.audio} controls className="w-full" />
            {pending.contentType && (
              <p className="text-sm text-gray-600">{pending.contentType}</p>
            )}
            {typeof pending.duration === 'number' && !Number.isNaN(pending.duration) && (
              <p className="text-sm text-gray-600">Duration: {pending.duration.toFixed(1)}s</p>
            )}
          </div>
        )}
        {pending.type === 'text' && pending.illustration && (
          <img src={pending.illustration} alt="illustration" className="mb-2 max-h-40" />
        )}
        {(pending.type === 'file' || pending.type === 'text') && (
          <p className="whitespace-pre-wrap">{pending.description}</p>
        )}
        <div className="mt-2 space-x-2">
          <button
            className="bg-blue-500 text-white px-3 py-1 disabled:opacity-50"
            onClick={save}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            className="px-3 py-1 border"
            onClick={cancel}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-red-600 mt-2">{error}</p>}
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
        aria-label="Quick add"
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <input
        className="border p-2 w-full mb-2"
        placeholder="Decks (comma separated)"
        aria-label="Decks (comma separated)"
        value={decksInput}
        onChange={e => setDecksInput(e.target.value)}
      />
      <div className="flex space-x-2">
        <button
          className="bg-blue-500 text-white px-3 py-1 disabled:opacity-50"
          onClick={previewText}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Preview'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,audio/*"
          onChange={handleFile}
          aria-label="Upload file"
        />
      </div>
      {error && <p className="text-red-600 mt-2">{error}</p>}
    </div>
  );
}
