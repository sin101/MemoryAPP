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
      // Run RAKE (server) and Pollinations AI (browser) in parallel
      const snippet = txt.replace(/\s+/g, ' ').trim().slice(0, 1200);
      const aiPrompt =
        'Extract exactly 10 specific, meaningful topic tags from this text. ' +
        'Tags must be concrete nouns, named entities, or short technical/domain phrases. ' +
        'Avoid generic words like "content", "text", "information", "overview". ' +
        'Output ONLY a JSON array of lowercase hyphenated strings, e.g. ["machine-learning","python","neural-network","climate-change"]. ' +
        'Text: ' + snippet;

      const [rakeRes, aiRes] = await Promise.allSettled([
        fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: txt, type }),
          signal: analyzeController.current.signal,
        }).then(r => r.ok ? r.json() : Promise.reject()),

        fetch('https://text.pollinations.ai/openai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai-large',
            messages: [{ role: 'user', content: aiPrompt }],
            max_tokens: 300,
          }),
          signal: analyzeController.current.signal,
        }).then(async r => {
          if (!r.ok) return null;
          const j = await r.json();
          const content = j.choices?.[0]?.message?.content ?? '';
          if (content.includes('IMPORTANT NOTICE') || content.includes('deprecated')) return null;
          const match = content.match(/\[[\s\S]*?\]/);
          if (!match) return null;
          const parsed = JSON.parse(match[0]);
          return Array.isArray(parsed)
            ? parsed.map(t => String(t).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 32)).filter(t => t.length > 2)
            : null;
        }),
      ]);

      const rakeTags = rakeRes.status === 'fulfilled' ? (rakeRes.value?.suggestedTags ?? []) : [];
      const aiTags   = aiRes.status === 'fulfilled' && Array.isArray(aiRes.value) ? aiRes.value : [];

      // Merge: AI tags first (better quality), then RAKE tags to fill up to 10
      const merged = [...aiTags];
      for (const t of rakeTags) {
        if (!merged.includes(t)) merged.push(t);
        if (merged.length >= 10) break;
      }
      setSuggestedTags(merged.slice(0, 10));
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

    setFileProcessing(true);
    try {
      if (kind === 'pdf' || kind === 'textfile') {
        let extractedText = '';
        if (kind === 'pdf') {
          const buf = await file.arrayBuffer();
          const result = await extractPdfText(buf);
          extractedText = result.text;
          if (!result.hasText) {
            setFileSizeWarning('This PDF appears to be image-based — no extractable text found.');
          }
        } else {
          extractedText = await file.text();
        }
        if (extractedText && aiEnabled) {
          await analyzeText(extractedText.slice(0, 8000), kind === 'pdf' ? 'article' : 'text');
        }
      } else if (kind === 'video' && aiEnabled) {
        // Extract first frame from video and run vision analysis on it
        setTagsLoading(true);
        setSuggestedTags([]);
        try {
          const videoUrl = URL.createObjectURL(file);
          const frameBase64 = await new Promise((resolve) => {
            const video = document.createElement('video');
            video.src = videoUrl;
            video.muted = true;
            video.preload = 'metadata';
            video.onloadeddata = () => {
              video.currentTime = Math.min(1, video.duration * 0.1); // 10% in or 1s
            };
            video.onseeked = () => {
              const canvas = document.createElement('canvas');
              canvas.width = Math.min(video.videoWidth, 640);
              canvas.height = Math.min(video.videoHeight, 480);
              canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(videoUrl);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
              resolve(dataUrl.split(',')[1]);
            };
            video.onerror = () => { URL.revokeObjectURL(videoUrl); resolve(null); };
            video.load();
          });

          if (frameBase64) {
            const visionPrompt =
              'This is a frame from a video. Analyze it: identify scene, objects, people, activities, setting, colors, any text on screen, and the likely video topic/genre. ' +
              'Reply ONLY with this exact JSON (no markdown): ' +
              '{"description":"3-4 sentence description of the video content based on this frame","extractedText":"any text visible on screen or empty string","tags":["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10"]}. ' +
              'Tags must be specific: genre, topic, activity, location, people type — not generic words.';
            const res = await fetch('https://text.pollinations.ai/openai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'openai-large',
                messages: [{ role: 'user', content: [
                  { type: 'text', text: visionPrompt },
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frameBase64}` } },
                ]}],
                max_tokens: 600,
              }),
              signal: AbortSignal.timeout(30000),
            });
            if (res.ok) {
              const json = await res.json();
              const content = json.choices?.[0]?.message?.content ?? '';
              if (!content.includes('IMPORTANT NOTICE') && !content.includes('deprecated')) {
                const match = content.match(/\{[\s\S]*\}/);
                if (match) {
                  try {
                    const parsed = JSON.parse(match[0]);
                    const vTags = Array.isArray(parsed.tags)
                      ? parsed.tags.map(t => String(t).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 32)).filter(t => t.length > 2)
                      : [];
                    // Also analyze filename
                    const nameText = file.name.replace(/\.[^.]+$/, '').replace(/[-_.]/g, ' ');
                    const allTags = [...vTags];
                    if (nameText.length > 3) {
                      const textRes = await fetch('/api/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: nameText + ' ' + (parsed.description || ''), type: 'video' }),
                      });
                      if (textRes.ok) {
                        const textData = await textRes.json();
                        for (const t of (textData.suggestedTags || [])) {
                          if (!allTags.includes(t)) allTags.push(t);
                          if (allTags.length >= 10) break;
                        }
                      }
                    }
                    setSuggestedTags(allTags.slice(0, 10));
                  } catch { /* ignore */ }
                }
              }
            }
          } else {
            // No frame extracted — fall back to filename analysis
            const nameText = file.name.replace(/\.[^.]+$/, '').replace(/[-_.]/g, ' ');
            if (nameText.length > 3) await analyzeText(nameText, 'video');
          }
        } catch (e) {
          console.error('Video analysis error:', e);
        } finally {
          setTagsLoading(false);
        }
      } else if (kind === 'image' && aiEnabled) {
        // Analyze image via Pollinations vision API (called directly from browser)
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        const base64 = dataUrl.split(',')[1];
        const mime = file.type || 'image/jpeg';
        setTagsLoading(true);
        setSuggestedTags([]);
        try {
          const visionPrompt =
            'Analyze this image in detail. Identify: main subjects, objects, people, animals, scene/setting, colors, mood, style, any visible text, brands, landmarks, activities, and dominant themes. ' +
            'Reply ONLY with this exact JSON (no markdown, no code fences, no extra text): ' +
            '{"description":"3-4 sentence detailed description of everything you see","extractedText":"any text or words visible in the image verbatim, or empty string","tags":["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10"]}. ' +
            'Tags must be specific nouns, named entities, or domain phrases — not generic words.';
          const res = await fetch('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'openai-large',
              messages: [{
                role: 'user',
                content: [
                  { type: 'text', text: visionPrompt },
                  { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
                ],
              }],
              max_tokens: 600,
            }),
            signal: AbortSignal.timeout(30000),
          });
          let data = { description: '', extractedText: '', tags: [] };
          if (res.ok) {
            const json = await res.json();
            const content = json.choices?.[0]?.message?.content ?? '';
            if (!content.includes('IMPORTANT NOTICE') && !content.includes('deprecated')) {
              const match = content.match(/\{[\s\S]*\}/);
              if (match) {
                try {
                  const parsed = JSON.parse(match[0]);
                  data = {
                    description: String(parsed.description ?? ''),
                    extractedText: String(parsed.extractedText ?? ''),
                    tags: Array.isArray(parsed.tags) ? parsed.tags.map(t => String(t).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 32)).filter(t => t.length > 2) : [],
                  };
                } catch { /* ignore parse error */ }
              }
            }
          }
          // Combine with RAKE on description text + filename to add more tags
          const combinedText = [data.description, data.extractedText, file.name.replace(/\.[^.]+$/, '').replace(/[-_.]/g, ' ')].filter(Boolean).join(' ');
          const allTags = [...data.tags];
          if (combinedText.length > 20) {
            const textRes = await fetch('/api/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: combinedText, type: 'image' }),
            });
            if (textRes.ok) {
              const textData = await textRes.json();
              for (const t of (textData.suggestedTags || [])) {
                if (!allTags.includes(t)) allTags.push(t);
                if (allTags.length >= 10) break;
              }
            }
          }
          setSuggestedTags(allTags.slice(0, 10));
          file._imageAnalysis = data;
        } catch (e) {
          console.error('Image analysis error:', e);
        } finally {
          setTagsLoading(false);
        }
      }
    } catch (e) {
      console.error('File processing error:', e);
    } finally {
      setFileProcessing(false);
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
      const analysis = file._imageAnalysis || {};
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
        // Enrich image cards with vision analysis
        ...(isImage && analysis.description ? {
          description: analysis.description,
          content: [analysis.description, analysis.extractedText].filter(Boolean).join('\n\n'),
        } : {}),
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
