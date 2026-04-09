import React, { useState, useRef, useEffect, useCallback } from 'react';

const URL_RE = /^https?:\/\/[^\s]{4,}$/i;

const TYPE_LABELS = {
  youtube: { icon: '▶', label: 'YouTube', color: 'bg-red-100 text-red-700' },
  tweet:   { icon: '𝕏', label: 'Tweet',   color: 'bg-sky-100 text-sky-700' },
  article: { icon: '📰', label: 'Article', color: 'bg-amber-100 text-amber-700' },
  link:    { icon: '🔗', label: 'Link',    color: 'bg-gray-100 text-gray-700' },
};

function TypeBadge({ type }) {
  const info = TYPE_LABELS[type] || TYPE_LABELS.link;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${info.color}`}>
      <span>{info.icon}</span>
      {info.label}
    </span>
  );
}

function UrlPreview({ meta, loading, error }) {
  if (loading) {
    return (
      <div className="border rounded p-3 mb-2 flex items-center gap-2 text-sm text-gray-500">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full" />
        Fetching preview…
      </div>
    );
  }
  if (error) {
    return (
      <div className="border rounded p-3 mb-2 text-sm text-gray-500">
        🔗 Link will be saved as-is
      </div>
    );
  }
  if (!meta) return null;

  return (
    <div className="border rounded overflow-hidden mb-2">
      {meta.image && (
        <img
          src={meta.image}
          alt=""
          className="w-full h-32 object-cover"
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="p-2 space-y-1">
        <div className="flex items-center gap-2">
          <TypeBadge type={meta.type} />
          <span className="text-xs text-gray-400">{meta.domain}</span>
        </div>
        <p className="font-medium text-sm leading-snug line-clamp-2">{meta.title}</p>
        {meta.description && (
          <p className="text-xs text-gray-500 line-clamp-2">{meta.description}</p>
        )}
      </div>
    </div>
  );
}

export default function QuickAdd({ onAdd, initial, aiEnabled }) {
  const [text, setText] = useState(initial || '');
  const [decksInput, setDecksInput] = useState('');
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // URL preview state
  const [urlMeta, setUrlMeta] = useState(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState(false);
  const urlFetchController = useRef(null);

  const fileRef = useRef();

  useEffect(() => { setText(initial || ''); }, [initial]);

  const parseDecks = input =>
    input.split(',').map(d => d.trim()).filter(Boolean);

  const isUrl = value => URL_RE.test(value.trim());

  // Fetch URL preview with debounce
  const fetchUrlPreview = useCallback(async (url) => {
    if (urlFetchController.current) urlFetchController.current.abort();
    urlFetchController.current = new AbortController();
    setUrlLoading(true);
    setUrlError(false);
    setUrlMeta(null);
    try {
      const res = await fetch(`/api/fetch-url?url=${encodeURIComponent(url)}`, {
        signal: urlFetchController.current.signal,
      });
      if (!res.ok) throw new Error('Failed');
      const meta = await res.json();
      setUrlMeta(meta);
    } catch (e) {
      if (e.name !== 'AbortError') setUrlError(true);
    } finally {
      setUrlLoading(false);
    }
  }, []);

  // Debounced URL detection
  useEffect(() => {
    if (!isUrl(text)) {
      setUrlMeta(null);
      setUrlError(false);
      setUrlLoading(false);
      if (urlFetchController.current) urlFetchController.current.abort();
      return;
    }
    const timer = setTimeout(() => fetchUrlPreview(text.trim()), 600);
    return () => clearTimeout(timer);
  }, [text, fetchUrlPreview]);

  const previewText = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (isUrl(trimmed)) {
      // Save as URL card via /api/clip
      setPending({
        _isUrl: true,
        url: trimmed,
        meta: urlMeta,
        decks: parseDecks(decksInput),
      });
      return;
    }

    // Text note
    setLoading(true);
    setError(null);
    const data = {
      title: text.slice(0, 60),
      description: text,
      content: text,
      type: 'text',
      decks: parseDecks(decksInput),
    };
    if (aiEnabled) {
      try {
        const res = await fetch('/api/illustrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        });
        const json = await res.json();
        if (json.image) data.illustration = json.image;
      } catch (e) {
        console.error(e);
      }
    }
    setPending(data);
    setLoading(false);
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
    if (file) prepareFile(file);
  };

  const handlePaste = e => {
    const item = e.clipboardData.items[0];
    if (item && item.kind === 'file') {
      prepareFile(item.getAsFile());
      return;
    }
    // Text paste — let the textarea handle it, URL detection will kick in
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
      if (pending._isUrl) {
        const res = await fetch('/api/clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: pending.url, decks: pending.decks }),
        });
        const card = await res.json();
        onAdd(card);
      } else if (pending.type === 'video' && pending.video) {
        const base64 = pending.video.split(',')[1];
        const res = await fetch('/api/video-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: pending.title, video: base64 }),
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
          }),
        });
        const card = await res.json();
        onAdd({ ...card, audio: pending.audio });
      } else if (pending.type === 'text') {
        const res = await fetch('/api/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pending),
        });
        const card = await res.json();
        onAdd(card);
      } else {
        onAdd(pending);
      }
      setPending(null);
      setText('');
      setDecksInput('');
      setUrlMeta(null);
    } catch (e) {
      console.error(e);
      setError('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => setPending(null);

  // ── Preview screen ─────────────────────────────────────────────
  if (pending) {
    const meta = pending.meta;
    return (
      <div className="border rounded p-3 mb-4">
        <h4 className="font-semibold mb-2 text-sm">Preview</h4>

        {pending._isUrl && (
          <div className="mb-2">
            {meta ? (
              <>
                {meta.image && (
                  <img src={meta.image} alt="" className="w-full h-32 object-cover rounded mb-2"
                    onError={e => { e.currentTarget.style.display = 'none'; }} />
                )}
                <div className="flex items-center gap-2 mb-1">
                  <TypeBadge type={meta.type} />
                  <span className="text-xs text-gray-400">{meta.domain}</span>
                </div>
                <p className="font-medium text-sm">{meta.title}</p>
                {meta.description && <p className="text-xs text-gray-500 mt-1 line-clamp-3">{meta.description}</p>}
              </>
            ) : (
              <p className="text-sm text-gray-600 break-all">{pending.url}</p>
            )}
          </div>
        )}

        {pending.type === 'image' && pending.image && (
          <img src={pending.image} alt={pending.title} className="mb-2 max-h-40 rounded" />
        )}
        {pending.type === 'video' && pending.video && (
          <video src={pending.video} controls className="mb-2 max-h-40 rounded" />
        )}
        {pending.type === 'audio' && pending.audio && (
          <div className="mb-2">
            <audio src={pending.audio} controls className="w-full" />
            {pending.contentType && <p className="text-xs text-gray-500">{pending.contentType}</p>}
            {typeof pending.duration === 'number' && !Number.isNaN(pending.duration) && (
              <p className="text-xs text-gray-500">Duration: {pending.duration.toFixed(1)}s</p>
            )}
          </div>
        )}
        {pending.type === 'text' && pending.illustration && (
          <img src={pending.illustration} alt="illustration" className="mb-2 max-h-40 rounded" />
        )}
        {pending.type === 'text' && (
          <p className="whitespace-pre-wrap text-sm">{pending.description}</p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            className="bg-blue-500 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
            onClick={save}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            className="px-3 py-1 border rounded text-sm"
            onClick={cancel}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-red-600 mt-2 text-sm">{error}</p>}
      </div>
    );
  }

  // ── Input screen ───────────────────────────────────────────────
  const showingUrl = isUrl(text.trim());

  return (
    <div
      className="border rounded p-3 mb-4"
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      onPaste={handlePaste}
    >
      <div className="relative mb-2">
        <textarea
          className="border rounded p-2 w-full text-sm resize-none"
          rows={showingUrl ? 2 : 3}
          placeholder="Paste a URL, type a note, or drop a file…"
          aria-label="Quick add"
          value={text}
          onChange={e => setText(e.target.value)}
        />
        {showingUrl && (
          <div className="absolute top-2 right-2">
            <TypeBadge type={urlMeta?.type || 'link'} />
          </div>
        )}
      </div>

      {showingUrl && (
        <UrlPreview meta={urlMeta} loading={urlLoading} error={urlError} />
      )}

      <input
        className="border rounded p-2 w-full mb-2 text-sm"
        placeholder="Decks (comma separated)"
        aria-label="Decks"
        value={decksInput}
        onChange={e => setDecksInput(e.target.value)}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="bg-blue-500 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
          onClick={previewText}
          disabled={loading || !text.trim()}
        >
          {loading ? 'Loading…' : showingUrl ? 'Add URL' : 'Preview'}
        </button>
        <label className="flex items-center gap-1 cursor-pointer text-sm text-gray-500 hover:text-gray-700">
          <span>📎</span>
          <span>File</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,audio/*"
            className="hidden"
            onChange={handleFile}
            aria-label="Upload file"
          />
        </label>
      </div>
      {error && <p className="text-red-600 mt-2 text-sm">{error}</p>}
    </div>
  );
}
