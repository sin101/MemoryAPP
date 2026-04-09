import React, { useState, useRef, useEffect, useCallback } from 'react';
import { extractPdfText } from '../pdfExtractor';

const URL_RE = /^https?:\/\/[^\s]{4,}$/i;

const ACCEPTED_TYPES = [
  'image/*', 'video/*', 'audio/*',
  '.pdf', '.txt', '.md', '.csv', '.json', '.rtf',
].join(',');

const TYPE_LABELS = {
  youtube: { icon: '▶', label: 'YouTube', color: 'bg-red-100 text-red-700' },
  tweet:   { icon: '𝕏', label: 'Tweet',   color: 'bg-sky-100 text-sky-700' },
  article: { icon: '📰', label: 'Article', color: 'bg-amber-100 text-amber-700' },
  link:    { icon: '🔗', label: 'Link',    color: 'bg-gray-100 text-gray-700' },
};

const FILE_SIZE_WARN_MB = 20; // warn above this
const FILE_SIZE_MAX_MB  = 50; // block above this

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
        <img src={meta.image} alt="" className="w-full h-32 object-cover"
          onError={e => { e.currentTarget.style.display = 'none'; }} />
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

function SuggestedTags({ tags, selected, onToggle, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mt-1">
        <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full" />
        Analyzing content…
      </div>
    );
  }
  if (!tags.length) return null;
  return (
    <div className="mt-1">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Suggested tags — click to add:</p>
      <div className="flex flex-wrap gap-1">
        {tags.map(tag => {
          const active = selected.has(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggle(tag)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition border
                ${active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                }`}
            >
              {active ? '✓ ' : '+ '}{tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Drop Zone ──────────────────────────────────────────────────────────────
function DropZone({ onFiles, dragActive }) {
  return (
    <div
      className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 py-5 px-4 text-center transition
        ${dragActive
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10'
        }`}
    >
      <span className="text-3xl select-none">{dragActive ? '📂' : '📎'}</span>
      <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
        {dragActive ? 'Drop it!' : 'Drag & drop a file here'}
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
        Images · Audio · Video · PDF · Text files
      </p>
      <label className="mt-1 cursor-pointer text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition font-medium text-gray-700 dark:text-gray-300">
        Browse…
        <input
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={e => {
            if (e.target.files[0]) onFiles(e.target.files[0]);
            e.target.value = '';
          }}
          aria-label="Browse file"
        />
      </label>
    </div>
  );
}

// ── File preview pill ──────────────────────────────────────────────────────
function FilePill({ file, onRemove }) {
  return (
    <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-sm">
      <span className="text-lg">{getFileEmoji(file)}</span>
      <span className="font-medium truncate max-w-[180px]">{file.name}</span>
      <span className="text-xs text-gray-400 ml-auto shrink-0">{fmt(file.size)}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 text-gray-400 hover:text-red-500 transition"
        aria-label="Remove file"
      >
        ✕
      </button>
    </div>
  );
}

function getFileEmoji(file) {
  if (!file) return '📄';
  if (file.type.startsWith('image/')) return '🖼️';
  if (file.type.startsWith('video/')) return '🎬';
  if (file.type.startsWith('audio/')) return '🎤';
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) return '📕';
  if (/\.(txt|md|rtf|csv|json)$/i.test(file.name)) return '📝';
  return '📄';
}

function getFileKind(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) return 'pdf';
  if (/\.(txt|md|rtf|csv|json)$/i.test(file.name)) return 'textfile';
  return 'file';
}

// ── Progress bar ───────────────────────────────────────────────────────────
function ProgressBar({ label, done }) {
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
        {done && <span className="text-xs text-green-600 dark:text-green-400 font-medium">Done ✓</span>}
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        {done ? (
          <div className="h-full bg-green-500 rounded-full w-full transition-all duration-300" />
        ) : (
          <div className="h-full bg-blue-500 rounded-full animate-[progress_1.2s_ease-in-out_infinite]"
            style={{ width: '40%', animation: 'progress 1.2s ease-in-out infinite' }} />
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function QuickAdd({ onAdd, initial, aiEnabled }) {
  const [text, setText] = useState(initial || '');
  const [decksInput, setDecksInput] = useState('');
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStage, setSaveStage] = useState(''); // 'saving' | 'done'
  const [error, setError] = useState(null);

  // Drag & drop
  const [dragActive, setDragActive] = useState(false);
  const [showDropZone, setShowDropZone] = useState(false);
  const [droppedFile, setDroppedFile] = useState(null);
  const [fileProcessing, setFileProcessing] = useState(false);
  const [fileSizeWarning, setFileSizeWarning] = useState(null);

  // URL preview
  const [urlMeta, setUrlMeta] = useState(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState(false);
  const urlFetchController = useRef(null);

  // AI tag suggestions
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState(new Set());
  const analyzeController = useRef(null);

  useEffect(() => { setText(initial || ''); }, [initial]);

  const parseDecks = input =>
    input.split(',').map(d => d.trim()).filter(Boolean);

  const isUrl = value => URL_RE.test(value.trim());

  // ── URL preview ──────────────────────────────────────────────────
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

  // ── AI analysis ──────────────────────────────────────────────────
  const analyzeText = useCallback(async (txt, type = 'text') => {
    if (!aiEnabled || txt.length < 30) return;
    if (analyzeController.current) analyzeController.current.abort();
    analyzeController.current = new AbortController();
    setTagsLoading(true);
    setSuggestedTags([]);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: txt, type }),
        signal: analyzeController.current.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      setSuggestedTags(data.suggestedTags || []);
    } catch (e) {
      if (e.name !== 'AbortError') setSuggestedTags([]);
    } finally {
      setTagsLoading(false);
    }
  }, [aiEnabled]);

  const toggleTag = (tag) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  };

  // ── URL debounce ────────────────────────────────────────────────
  useEffect(() => {
    if (droppedFile) return; // file takes priority
    if (!isUrl(text)) {
      setUrlMeta(null); setUrlError(false); setUrlLoading(false);
      setSuggestedTags([]); setSelectedTags(new Set());
      if (urlFetchController.current) urlFetchController.current.abort();
      if (analyzeController.current) analyzeController.current.abort();
      return;
    }
    const timer = setTimeout(() => fetchUrlPreview(text.trim()), 600);
    return () => clearTimeout(timer);
  }, [text, droppedFile, fetchUrlPreview]);

  useEffect(() => {
    if (!urlMeta) return;
    const textToAnalyze = urlMeta.description || urlMeta.title || '';
    if (textToAnalyze) analyzeText(textToAnalyze, urlMeta.type);
  }, [urlMeta, analyzeText]);

  // ── File processing ─────────────────────────────────────────────
  const processFile = useCallback(async (file) => {
    setFileSizeWarning(null);
    const sizeMB = file.size / (1024 * 1024);

    if (sizeMB > FILE_SIZE_MAX_MB) {
      setFileSizeWarning(`File too large (${fmt(file.size)}). Max ${FILE_SIZE_MAX_MB} MB.`);
      return;
    }
    if (sizeMB > FILE_SIZE_WARN_MB) {
      setFileSizeWarning(`Large file (${fmt(file.size)}) — this may take a moment.`);
    }

    setDroppedFile(file);
    setSuggestedTags([]);
    setSelectedTags(new Set());

    const kind = getFileKind(file);

    // For text-based files, extract content and analyze
    if (kind === 'textfile' || kind === 'pdf') {
      setFileProcessing(true);
      try {
        let extractedText = '';

        if (kind === 'pdf') {
          const buf = await file.arrayBuffer();
          const result = await extractPdfText(buf);
          extractedText = result.text;
          if (!result.hasText) {
            setFileSizeWarning('This PDF appears to be image-based — no extractable text found.');
          }
        } else {
          // Plain text files
          extractedText = await file.text();
        }

        if (extractedText && aiEnabled) {
          await analyzeText(extractedText.slice(0, 8000), kind === 'pdf' ? 'article' : 'text');
        }
      } catch (e) {
        console.error('File extraction error:', e);
      } finally {
        setFileProcessing(false);
      }
    }
  }, [aiEnabled, analyzeText]);

  // ── Drop handlers ───────────────────────────────────────────────
  const handleDragEnter = e => { e.preventDefault(); setDragActive(true); setShowDropZone(true); };
  const handleDragOver  = e => { e.preventDefault(); setDragActive(true); setShowDropZone(true); };
  const handleDragLeave = e => { e.preventDefault(); setDragActive(false); };
  const handleDrop = e => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handlePaste = e => {
    const item = e.clipboardData.items[0];
    if (item?.kind === 'file') {
      processFile(item.getAsFile());
    }
  };

  const removeFile = () => {
    setDroppedFile(null);
    setFileSizeWarning(null);
    setSuggestedTags([]);
    setSelectedTags(new Set());
    setFileProcessing(false);
    setShowDropZone(false);
  };

  // ── Build pending from file ─────────────────────────────────────
  const prepareFile = (file) => new Promise((resolve, reject) => {
    const kind = getFileKind(file);
    const isImage = kind === 'image';
    const isVideo = kind === 'video';
    const isAudio = kind === 'audio';
    const isPdf   = kind === 'pdf';
    const isText  = kind === 'textfile';

    if (isPdf || isText) {
      // We don't store binary for text/pdf — content will be in `content` field
      (async () => {
        try {
          let content = '';
          if (isPdf) {
            const buf = await file.arrayBuffer();
            const result = await extractPdfText(buf);
            content = result.text;
          } else {
            content = await file.text();
          }
          resolve({
            title: file.name,
            source: file.name,
            type: isPdf ? 'article' : 'text',
            content,
            description: content.slice(0, 300),
            decks: parseDecks(decksInput),
            tags: [...selectedTags],
            contentType: file.type,
          });
        } catch (e) { reject(e); }
      })();
      return;
    }

    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const data = {
        title: file.name,
        source: file.name,
        type: isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'file',
        decks: parseDecks(decksInput),
        tags: [...selectedTags],
        image: isImage ? reader.result : undefined,
        video: isVideo ? reader.result : undefined,
        audio: isAudio ? reader.result : undefined,
        contentType: file.type,
      };
      if (isAudio) {
        const audioEl = new Audio(reader.result);
        audioEl.onloadedmetadata = () => { data.duration = audioEl.duration; resolve(data); };
        audioEl.onerror = () => resolve(data); // resolve anyway
      } else {
        resolve(data);
      }
    };
    reader.readAsDataURL(file);
  });

  // ── Preview / submit ────────────────────────────────────────────
  const previewText = async () => {
    const trimmed = text.trim();

    // File takes priority
    if (droppedFile) {
      setLoading(true);
      setError(null);
      try {
        const data = await prepareFile(droppedFile);
        setPending(data);
      } catch (e) {
        setError('Failed to read file.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!trimmed) return;

    if (isUrl(trimmed)) {
      setPending({
        _isUrl: true,
        url: trimmed,
        meta: urlMeta,
        decks: parseDecks(decksInput),
        suggestedTags: [...selectedTags],
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
      tags: [...selectedTags],
    };
    const jobs = [];
    if (aiEnabled) {
      jobs.push(
        fetch('/api/illustrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        })
          .then(r => r.json())
          .then(json => { if (json.image) data.illustration = json.image; })
          .catch(() => {})
      );
      if (!suggestedTags.length && text.length >= 30) {
        jobs.push(analyzeText(text, 'text'));
      }
    }
    await Promise.all(jobs);
    setPending(data);
    setLoading(false);
  };

  const save = async () => {
    if (!pending) return;
    setSaving(true);
    setSaveStage('saving');
    setError(null);
    try {
      let card;

      if (pending._isUrl) {
        const res = await fetch('/api/clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: pending.url,
            decks: pending.decks,
            tags: pending.suggestedTags?.length ? pending.suggestedTags : undefined,
          }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        card = await res.json();
        onAdd(card);
      } else if (pending.type === 'video' && pending.video) {
        const base64 = pending.video.split(',')[1];
        const res = await fetch('/api/video-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: pending.title, video: base64 }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        card = await res.json();
        onAdd({ ...card, video: card.video || pending.video });
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
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        card = await res.json();
        // Prefer server URL (persists across reloads); fall back to local data URI for immediate playback
        onAdd({ ...card, audio: card.audio || pending.audio });
      } else {
        // text, pdf-as-article, image (local), file
        const body = { ...pending };
        // Strip huge base64 image from body if too large — keep image local-only
        const bodyStr = JSON.stringify(body);
        if (bodyStr.length > 9 * 1024 * 1024) {
          delete body.image;
        }
        const res = await fetch('/api/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        card = await res.json();
        onAdd({ ...card, image: pending.image });
      }

      // Brief "Done" flash before resetting
      setSaveStage('done');
      await new Promise(r => setTimeout(r, 900));

      // Reset everything
      setPending(null);
      setText('');
      setDecksInput('');
      setDroppedFile(null);
      setShowDropZone(false);
      setFileSizeWarning(null);
      setUrlMeta(null);
      setSuggestedTags([]);
      setSelectedTags(new Set());
    } catch (e) {
      console.error(e);
      setError(`Failed to save: ${e.message}`);
    } finally {
      setSaving(false);
      setSaveStage('');
    }
  };

  const cancel = () => setPending(null);

  // ── Preview screen ──────────────────────────────────────────────
  if (pending) {
    const meta = pending.meta;
    return (
      <div className="border rounded-xl p-3 mb-4">
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
        {(pending.type === 'text' || pending.type === 'article') && pending.illustration && (
          <img src={pending.illustration} alt="illustration" className="mb-2 max-h-40 rounded" />
        )}
        {pending.type === 'text' && (
          <p className="whitespace-pre-wrap text-sm line-clamp-6">{pending.description}</p>
        )}
        {pending.type === 'article' && pending.content && (
          <p className="whitespace-pre-wrap text-sm line-clamp-6 text-gray-600 dark:text-gray-400">
            {pending.content.slice(0, 400)}{pending.content.length > 400 ? '…' : ''}
          </p>
        )}

        {(pending.suggestedTags?.length > 0 || pending.tags?.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {(pending.suggestedTags || pending.tags || []).map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {saveStage && (
          <div className="mt-3">
            <ProgressBar
              label={saveStage === 'done' ? 'Card saved!' : 'Saving card…'}
              done={saveStage === 'done'}
            />
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition"
            onClick={save}
            disabled={saving}
          >
            {saving
              ? saveStage === 'done'
                ? '✓ Saved!'
                : 'Saving…'
              : 'Save'}
          </button>
          <button
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition"
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

  // ── Input screen ────────────────────────────────────────────────
  const showingUrl = !droppedFile && isUrl(text.trim());
  const canSubmit  = !loading && !fileProcessing && (droppedFile || text.trim());

  return (
    <div
      className="border rounded-xl p-3 mb-4"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {/* Text / URL input — hidden when a file is loaded */}
      {!droppedFile && (
        <div className="relative mb-2">
          <textarea
            className="border rounded-lg p-2 w-full text-sm resize-none"
            rows={showingUrl ? 2 : 3}
            placeholder="Paste a URL, type a note, or drop a file below…"
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
      )}

      {showingUrl && <UrlPreview meta={urlMeta} loading={urlLoading} error={urlError} />}

      {/* Dropped file pill */}
      {droppedFile && (
        <div className="mb-2">
          <FilePill file={droppedFile} onRemove={removeFile} />
        </div>
      )}

      {/* Drop zone — shown when dragging over or user toggled it open */}
      {!droppedFile && (showDropZone || dragActive) && (
        <div className="mb-2">
          <DropZone onFiles={f => { processFile(f); setShowDropZone(false); }} dragActive={dragActive} />
        </div>
      )}

      {/* File size warning */}
      {fileSizeWarning && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">{fileSizeWarning}</p>
      )}

      {/* Processing spinner */}
      {fileProcessing && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mb-1">
          <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full" />
          Extracting text…
        </div>
      )}

      {/* AI tag suggestions */}
      {aiEnabled && (
        <SuggestedTags
          tags={suggestedTags}
          selected={selectedTags}
          onToggle={toggleTag}
          loading={tagsLoading}
        />
      )}

      {/* Decks input */}
      <input
        className="border rounded-lg p-2 w-full mb-2 text-sm mt-2"
        placeholder="Decks (comma separated)"
        aria-label="Decks"
        value={decksInput}
        onChange={e => setDecksInput(e.target.value)}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition"
          onClick={previewText}
          disabled={!canSubmit}
        >
          {loading || fileProcessing
            ? 'Processing…'
            : droppedFile
              ? 'Preview file'
              : showingUrl
                ? 'Add URL'
                : 'Preview'}
        </button>

        {/* Attach toggle */}
        {!droppedFile && (
          <button
            type="button"
            onClick={() => setShowDropZone(v => !v)}
            className={`text-sm px-2.5 py-1.5 rounded-lg border transition
              ${showDropZone
                ? 'border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500'
              }`}
            title="Attach a file"
          >
            📎 Attach
          </button>
        )}

        {droppedFile && (
          <button
            type="button"
            onClick={removeFile}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
          >
            ✕ Clear file
          </button>
        )}
      </div>

      {/* Loading bar for preview processing */}
      {loading && (
        <div className="mt-2">
          <ProgressBar label="Processing…" done={false} />
        </div>
      )}

      {error && <p className="text-red-600 mt-2 text-sm">{error}</p>}
    </div>
  );
}
