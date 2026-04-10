import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import CardGrid from './components/CardGrid';
import SuggestionsList from './components/SuggestionsList';
import QuickAdd from './components/QuickAdd';
import DeckSidebar from './components/DeckSidebar';
import GraphView from './components/GraphView';
import Chatbot from './components/Chatbot';
import EditCardModal from './components/EditCardModal';
import CardDetailModal from './components/CardDetailModal';
import ThemeSettings from './components/ThemeSettings';
import CryptoJS from 'crypto-js';
import { get, set } from 'idb-keyval';
import { setTagPaletteCache } from './tagColors';
import { openDB } from 'idb';

// ── IndexedDB ─────────────────────────────────────────────────────────────

const dbPromise = openDB('memory-store', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('links')) db.createObjectStore('links', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('usage')) db.createObjectStore('usage');
  },
});

const defaultCards = [
  { id: '1', title: 'Sample Note', description: 'Demo card used for the UI prototype.', tags: ['demo', 'sample'], decks: [], type: 'text', createdAt: new Date().toISOString() },
  { id: '2', title: 'JavaScript', description: 'Notes about JS.', tags: ['JavaScript', 'code'], decks: [], type: 'text', createdAt: new Date().toISOString() },
];

// ── Encryption helpers (module-level, no closure capture) ─────────────────

function encrypt(str, key) {
  if (!key) return str;
  return CryptoJS.AES.encrypt(str, key).toString();
}
function decrypt(str, key) {
  if (!key) return str;
  try { return CryptoJS.AES.decrypt(str, key).toString(CryptoJS.enc.Utf8); }
  catch { return str; }
}

// ── IDB helpers ───────────────────────────────────────────────────────────

async function loadCards(encKey) {
  const db = await dbPromise;
  const all = await db.transaction('cards').objectStore('cards').getAll();
  return all.map(({ data }) => { try { return JSON.parse(decrypt(data, encKey)); } catch { return null; } }).filter(Boolean);
}

async function saveCards(list, encKey) {
  const db = await dbPromise;
  const tx = db.transaction('cards', 'readwrite');
  const store = tx.objectStore('cards');
  await store.clear();
  for (const card of list) {
    await store.put({ id: card.id, data: encrypt(JSON.stringify(card), encKey) });
  }
}

async function loadLinks(encKey) {
  const db = await dbPromise;
  const all = await db.transaction('links').objectStore('links').getAll();
  return all.map(({ data }) => { try { return JSON.parse(decrypt(data, encKey)); } catch { return null; } }).filter(Boolean);
}

async function saveLinks(list, encKey) {
  const db = await dbPromise;
  const tx = db.transaction('links', 'readwrite');
  const store = tx.objectStore('links');
  await store.clear();
  for (const link of list) {
    await store.put({ id: link.id, data: encrypt(JSON.stringify(link), encKey) });
  }
}

async function loadUsage(encKey) {
  const db = await dbPromise;
  const store = db.transaction('usage').objectStore('usage');
  const keys = await store.getAllKeys();
  const result = {};
  for (const key of keys) {
    const val = await store.get(key);
    try { result[key] = JSON.parse(decrypt(val, encKey)); } catch { result[key] = 0; }
  }
  return result;
}

async function saveUsage(map, encKey) {
  const db = await dbPromise;
  const tx = db.transaction('usage', 'readwrite');
  const store = tx.objectStore('usage');
  await store.clear();
  for (const [key, val] of Object.entries(map)) {
    await store.put(encrypt(JSON.stringify(val), encKey), key);
  }
}

async function migrateLocalStorage(encKey) {
  const db = await dbPromise;
  if (await db.count('cards') > 0) return;
  for (const [lsKey, saveFn] of [['cards', saveCards], ['links', saveLinks]]) {
    const raw = localStorage.getItem(lsKey);
    if (raw) { try { await saveFn(JSON.parse(raw), encKey); } catch { /* ignore */ } localStorage.removeItem(lsKey); }
  }
  const rawUsage = localStorage.getItem('usage');
  if (rawUsage) { try { await saveUsage(JSON.parse(rawUsage), encKey); } catch { /* ignore */ } localStorage.removeItem('usage'); }
}

// ── Normalize card from server ────────────────────────────────────────────

function normalizeCard(c) {
  return {
    ...c,
    tags:  Array.isArray(c.tags)  ? c.tags  : [],
    decks: Array.isArray(c.decks) ? c.decks : [],
    audio: c.audio || (c.type === 'audio' && c.source && !c.source.startsWith('data:') ? `/api/media/${c.source}` : undefined),
    video: c.video || (c.type === 'video' && c.source && !c.source.startsWith('data:') ? `/api/media/${c.source}` : undefined),
  };
}

// ── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [cards, setCards] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [deckFilter, setDeckFilter] = useState(null);
  const [tagFilter, setTagFilter] = useState('');
  const [showGraph, setShowGraph] = useState(false);
  const [quickAddInitial, setQuickAddInitial] = useState('');
  const [links, setLinks] = useState([]);
  const [webSuggestionsEnabled, setWebSuggestionsEnabled] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [useSemantic, setUseSemantic] = useState(false);
  const [semanticResults, setSemanticResults] = useState([]);
  const [encKey, setEncKey] = useState('');
  const [usage, setUsage] = useState({});
  const [theme, setTheme] = useState('light');
  const [tagPalette, setTagPalette] = useState({});
  const [cardBg, setCardBg] = useState('#ffffff');
  const [cardBorder, setCardBorder] = useState('#d1d5db');
  const [accent, setAccent] = useState('#3b82f6');
  const [textColor, setTextColor] = useState('#000000');
  const [font, setFont] = useState('sans-serif');
  const [editingCard, setEditingCard] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [showSettings, setShowSettings] = useState(false);

  const importRef = useRef();
  const encKeyRef = useRef(encKey);
  useEffect(() => { encKeyRef.current = encKey; }, [encKey]);

  // Debounced usage save — batches rapid usage updates into one write
  const usageSaveTimer = useRef(null);
  const pendingUsage = useRef(null);
  const flushUsage = useCallback(() => {
    if (pendingUsage.current !== null) {
      saveUsage(pendingUsage.current, encKeyRef.current);
      pendingUsage.current = null;
    }
  }, []);
  const debouncedSaveUsage = useCallback((map) => {
    pendingUsage.current = map;
    clearTimeout(usageSaveTimer.current);
    usageSaveTimer.current = setTimeout(flushUsage, 2000);
  }, [flushUsage]);

  // ── Settings load ─────────────────────────────────────────────────────

  useEffect(() => {
    get('encryptionKey').then(k => setEncKey(k || ''));
    get('aiEnabled').then(v => setAiEnabled(v === undefined ? true : v));
    get('webSuggestionsEnabled').then(v => setWebSuggestionsEnabled(v === undefined ? true : v));
    get('theme').then(t => t && setTheme(t));
    get('tagPalette').then(p => { if (p) { setTagPalette(p); setTagPaletteCache(p); } });
    get('cardBg').then(c => c && setCardBg(c));
    get('cardBorder').then(c => c && setCardBorder(c));
    get('accent').then(c => c && setAccent(c));
    get('textColor').then(c => c && setTextColor(c));
    get('font').then(f => f && setFont(f));
  }, []);

  // CSS variable syncing
  useEffect(() => { document.documentElement.style.setProperty('--accent-color', accent); }, [accent]);
  useEffect(() => { document.documentElement.style.setProperty('--text-color', textColor); }, [textColor]);
  useEffect(() => { document.documentElement.style.setProperty('--font-family', font); }, [font]);

  // ── Initial data load ─────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      await migrateLocalStorage(encKey);
      try {
        const res = await fetch('/api/cards');
        if (res.ok) {
          const data = await res.json();
          const cs = (data.cards || []).map(normalizeCard);
          setCards(cs);
          await saveCards(cs, encKey);
          setLinks(data.links || []);
          await saveLinks(data.links || [], encKey);
          setUsage(await loadUsage(encKey));
          return;
        }
      } catch { /* fall through to local */ }
      let stored = await loadCards(encKey);
      if (!stored.length) { stored = defaultCards; await saveCards(stored, encKey); }
      stored = stored.map(c => {
        if (c.deck && !c.decks) { c.decks = [c.deck]; delete c.deck; }
        return { ...c, decks: c.decks || [] };
      });
      setCards(stored);
      setLinks(await loadLinks(encKey));
      setUsage(await loadUsage(encKey));
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encKey]);

  // ── Semantic search ───────────────────────────────────────────────────

  useEffect(() => {
    if (!aiEnabled || !useSemantic || !query.trim()) { setSemanticResults([]); return; }
    const ctrl = new AbortController();
    fetch('/api/search/semantic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: ctrl.signal })
      .then(r => r.json()).then(setSemanticResults).catch(() => setSemanticResults([]));
    return () => ctrl.abort();
  }, [aiEnabled, query, useSemantic]);

  // ── Settings persist ──────────────────────────────────────────────────

  useEffect(() => {
    set('aiEnabled', aiEnabled);
    set('webSuggestionsEnabled', webSuggestionsEnabled);
    fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiEnabled, webSuggestionsEnabled }) }).catch(() => {});
    if (!aiEnabled) setUseSemantic(false);
  }, [aiEnabled, webSuggestionsEnabled]);

  useEffect(() => { set('theme', theme); }, [theme]);

  // ── Search + filter ───────────────────────────────────────────────────

  // Fuse only rebuilds when the indexed fields of cards change — not on every mutation
  const cardSignature = useMemo(() => cards.map(c => `${c.id}:${c.title}:${c.description}:${(c.tags||[]).join(',')}`).join('|'), [cards]);
  const fuse = useMemo(
    () => new Fuse(cards, { keys: ['title', 'description', 'tags'], threshold: 0.3 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardSignature]
  );

  const filtered = useMemo(() => {
    const base = useSemantic && query.trim()
      ? semanticResults
      : query.trim() ? fuse.search(query.trim()).map(r => r.item) : cards;
    return base.filter(c =>
      (!deckFilter || c.decks?.includes(deckFilter)) &&
      (!tagFilter || c.tags.includes(tagFilter))
    );
  }, [cards, fuse, query, deckFilter, tagFilter, useSemantic, semanticResults]);

  const decks = useMemo(() => cards.reduce((acc, c) => {
    (c.decks || []).forEach(d => { acc[d] = (acc[d] || 0) + 1; });
    return acc;
  }, {}), [cards]);

  const tagOptions = useMemo(() => Array.from(new Set(cards.flatMap(c => c.tags || []))), [cards]);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const titleMatches = fuse.search(query.trim()).slice(0, 5).map(r => r.item.title);
    const tagMatches = tagOptions.filter(t => t.toLowerCase().includes(query.toLowerCase()));
    return Array.from(new Set([...titleMatches, ...tagMatches])).slice(0, 5);
  }, [query, fuse, tagOptions]);

  // ── Card operations ───────────────────────────────────────────────────

  const selectCard = useCallback(card => {
    setSelected(card);
    setUsage(prev => {
      const next = { ...prev, [card.id]: (prev[card.id] || 0) + 1 };
      debouncedSaveUsage(next);
      return next;
    });
    fetch(`/api/cards/${card.id}/usage`, { method: 'POST' }).catch(() => {});
  }, [debouncedSaveUsage]);

  const addCard = useCallback(data => {
    const newCard = {
      id: String(Date.now()),
      createdAt: new Date().toISOString(),
      ...data,
      tags:  Array.isArray(data.tags)  ? data.tags  : [],
      decks: Array.isArray(data.decks) ? data.decks : [],
    };
    setCards(prev => {
      if (newCard.id && prev.some(c => c.id === newCard.id)) {
        const next = prev.map(c => c.id === newCard.id ? { ...c, ...newCard } : c);
        saveCards(next, encKeyRef.current);
        return next;
      }
      const next = [...prev, newCard];
      saveCards(next, encKeyRef.current);
      return next;
    });
  }, []);

  const editCard = useCallback(card => setEditingCard(card), []);

  const handleEditSave = useCallback(async updated => {
    setEditingCard(null);
    setCards(prev => {
      const next = prev.map(c => c.id === updated.id ? updated : c);
      saveCards(next, encKeyRef.current);
      return next;
    });
    try {
      await fetch(`/api/cards/${updated.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    } catch { /* saved locally */ }
  }, []);

  const deleteCard = useCallback(id => {
    setCards(prev => { const next = prev.filter(c => c.id !== id); saveCards(next, encKeyRef.current); return next; });
    setLinks(prev => { const next = prev.filter(l => l.from !== id && l.to !== id); saveLinks(next, encKeyRef.current); return next; });
    setUsage(prev => { const next = { ...prev }; delete next[id]; saveUsage(next, encKeyRef.current); return next; });
  }, []);

  const handleSuggestionAdd = useCallback(s => addCard({ title: s.title, description: s.description, tags: [s.tag || 'suggested'] }), [addCard]);
  const handleSuggestionEdit = useCallback(s => setQuickAddInitial(s.title), []);

  const handleLinkCreate = useCallback((from, to, type, annotation) => {
    fetch('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, type, annotation }) })
      .then(r => r.json())
      .then(link => setLinks(prev => { const next = [...prev, link]; saveLinks(next, encKeyRef.current); return next; }))
      .catch(console.error);
  }, []);

  const handleLinkEdit = useCallback((id, type, annotation) => {
    fetch(`/api/links/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, annotation }) })
      .then(r => r.json())
      .then(link => setLinks(prev => { const next = prev.map(l => l.id === id ? link : l); saveLinks(next, encKeyRef.current); return next; }))
      .catch(console.error);
  }, []);

  const toggleWebSuggestions = useCallback(() => setWebSuggestionsEnabled(prev => !prev), []);

  const handleSetKey = useCallback(() => {
    const k = prompt('Set encryption key', encKeyRef.current);
    if (k !== null) {
      setEncKey(k);
      set('encryptionKey', k);
      // Re-save with new key
      setCards(prev => { saveCards(prev, k); return prev; });
      setLinks(prev => { saveLinks(prev, k); return prev; });
      setUsage(prev => { saveUsage(prev, k); return prev; });
    }
  }, []);

  // ── Online/offline sync ───────────────────────────────────────────────

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  useEffect(() => {
    if (!online) return;
    (async () => {
      try {
        const syncRes = await fetch('/api/sync/status');
        if (!syncRes.ok) return;
        const { lastModified: serverTime } = await syncRes.json();
        const localTime = await get('lastSyncTime');
        if (localTime && serverTime && serverTime > localTime) {
          const res = await fetch('/api/cards');
          if (res.ok) {
            const data = await res.json();
            const cs = (data.cards || []).map(normalizeCard);
            setCards(cs);
            await saveCards(cs, encKeyRef.current);
            setLinks(data.links || []);
            await saveLinks(data.links || [], encKeyRef.current);
          }
        }
        await set('lastSyncTime', Date.now());
      } catch { /* ignore sync errors */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // ── SSE ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let es;
    let retryTimeout;

    function connect() {
      es = new EventSource('/api/events');

      es.addEventListener('cardCreated', e => {
        const card = JSON.parse(e.data);
        setCards(prev => {
          if (prev.some(c => c.id === card.id)) return prev;
          const next = [...prev, normalizeCard(card)];
          saveCards(next, encKeyRef.current);
          return next;
        });
      });

      es.addEventListener('cardUpdated', e => {
        const card = JSON.parse(e.data);
        setCards(prev => {
          const idx = prev.findIndex(c => c.id === card.id);
          if (idx === -1) return prev;
          // Skip save if nothing actually changed
          const existing = prev[idx];
          if (existing.summary === card.summary && existing.illustration === card.illustration &&
              JSON.stringify(existing.tags) === JSON.stringify(card.tags)) return prev;
          const next = [...prev];
          next[idx] = { ...existing, ...card };
          saveCards(next, encKeyRef.current);
          return next;
        });
      });

      es.addEventListener('cardRemoved', e => {
        const { id } = JSON.parse(e.data);
        setCards(prev => { const next = prev.filter(c => c.id !== id); saveCards(next, encKeyRef.current); return next; });
      });

      es.onerror = () => { es.close(); retryTimeout = setTimeout(connect, 5000); };
    }

    connect();
    return () => { clearTimeout(retryTimeout); es?.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Export / Import ───────────────────────────────────────────────────

  const exportData = useCallback(() => {
    fetch('/api/export/zip')
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'memory-export.zip'; a.click();
        URL.revokeObjectURL(url);
      })
      .catch(console.error);
  }, []);

  const importData = useCallback(e => {
    const file = e.target.files[0];
    if (!file) return;
    file.arrayBuffer().then(buf =>
      fetch('/api/import/json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: buf })
        .then(() => fetch('/api/cards'))
        .then(r => r.json())
        .then(data => {
          const cs = (data.cards || []).map(normalizeCard);
          setCards(cs); saveCards(cs, encKeyRef.current);
          setLinks(data.links || []); saveLinks(data.links || [], encKeyRef.current);
        })
        .catch(console.error)
    );
    importRef.current.value = '';
  }, []);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className={theme === 'dark' ? 'dark flex flex-col bg-gray-900 text-gray-100 min-h-screen' : 'flex flex-col min-h-screen bg-gray-50 text-gray-900'}>

      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm sticky top-0 z-20">
        <span className="font-bold text-lg tracking-tight text-blue-600 dark:text-blue-400 shrink-0">MemoryApp</span>

        <div className="relative flex-1 max-w-lg">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
          <input
            id="search"
            type="text"
            placeholder="Search cards…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="border pl-8 pr-3 py-1.5 w-full text-sm rounded-lg"
            aria-autocomplete="list"
            aria-controls="search-suggestions"
          />
          {suggestions.length > 0 && (
            <ul id="search-suggestions" role="listbox" className="absolute z-30 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg mt-1 w-full max-h-48 overflow-auto shadow-lg text-sm">
              {suggestions.map(s => (
                <li key={s}>
                  <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100" onClick={() => setQuery(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <select id="tag-filter" value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="border py-1.5 px-2 text-sm rounded-lg shrink-0">
          <option value="">All Tags</option>
          {tagOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <button
          onClick={() => setShowGraph(g => !g)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition shrink-0 ${showGraph ? 'bg-blue-600 text-white' : 'border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
        >
          {showGraph ? 'Grid' : 'Graph'}
        </button>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button onClick={() => setShowSettings(s => !s)} title="Settings" className={`p-1.5 rounded-lg text-sm transition ${showSettings ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>⚙️</button>
          <button onClick={handleSetKey} title="Encryption" className="p-1.5 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition">🔑</button>
          <button onClick={exportData} title="Export" className="p-1.5 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition">⬇️</button>
          <button onClick={() => importRef.current.click()} title="Import" className="p-1.5 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition">⬆️</button>
          <input type="file" ref={importRef} onChange={importData} className="hidden" />
        </div>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
          <div className="flex items-center gap-6 flex-wrap text-sm mb-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={aiEnabled} onChange={e => setAiEnabled(e.target.checked)} className="rounded" />
              <span>AI features</span>
            </label>
            <label className={`flex items-center gap-1.5 ${!aiEnabled ? 'opacity-40' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={useSemantic} onChange={e => setUseSemantic(e.target.checked)} disabled={!aiEnabled} className="rounded" />
              <span>Semantic search</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={webSuggestionsEnabled} onChange={toggleWebSuggestions} className="rounded" />
              <span>Web suggestions</span>
            </label>
          </div>
          <ThemeSettings
            theme={theme} setTheme={setTheme}
            tagPalette={tagPalette}
            setTagPalette={p => { setTagPalette(p); set('tagPalette', p); setTagPaletteCache(p); }}
            cardBg={cardBg} setCardBg={c => { setCardBg(c); set('cardBg', c); }}
            cardBorder={cardBorder} setCardBorder={c => { setCardBorder(c); set('cardBorder', c); }}
            accent={accent} setAccent={c => { setAccent(c); set('accent', c); }}
            textColor={textColor} setTextColor={c => { setTextColor(c); set('textColor', c); }}
            font={font} setFont={f => { setFont(f); set('font', f); }}
          />
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        <DeckSidebar decks={decks} current={deckFilter} onSelect={setDeckFilter} />

        <main className="flex-1 flex flex-col min-w-0 p-4 gap-4 overflow-y-auto">
          <QuickAdd onAdd={addCard} initial={quickAddInitial} aiEnabled={aiEnabled} />

          {showGraph ? (
            <GraphView cards={cards} links={links} onLink={handleLinkCreate} onLinkEdit={handleLinkEdit} cardBg={cardBg} cardBorder={cardBorder} />
          ) : (
            <CardGrid cards={filtered} onSelect={selectCard} onEdit={editCard} onDelete={deleteCard} cardBg={cardBg} cardBorder={cardBorder} highlight={query} />
          )}

          <section className="mt-2">
            <h2 className="text-base font-semibold mb-2 text-gray-700 dark:text-gray-300">Suggestions</h2>
            <SuggestionsList card={selected} cards={cards} enabled={webSuggestionsEnabled} onAdd={handleSuggestionAdd} onEdit={handleSuggestionEdit} />
          </section>

          <section className="mt-2">
            <h2 className="text-base font-semibold mb-2 text-gray-700 dark:text-gray-300">Chatbot</h2>
            <Chatbot />
          </section>
        </main>
      </div>

      {selected && (
        <CardDetailModal card={selected} onClose={() => setSelected(null)} onEdit={editCard} onDelete={deleteCard} />
      )}
      {editingCard && (
        <EditCardModal card={editingCard} onSave={handleEditSave} onClose={() => setEditingCard(null)} />
      )}
    </div>
  );
}
