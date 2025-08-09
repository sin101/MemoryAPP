import { useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import CardGrid from './components/CardGrid';
import SuggestionsList from './components/SuggestionsList';
import QuickAdd from './components/QuickAdd';
import DeckSidebar from './components/DeckSidebar';
import GraphView from './components/GraphView';
import Chatbot from './components/Chatbot';
import ThemeSettings from './components/ThemeSettings';
import CryptoJS from 'crypto-js';
import { get, set } from 'idb-keyval';
import { setTagPaletteCache } from './tagColors';
import { openDB } from 'idb';

const dbPromise = openDB('memory-store', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('cards')) {
      db.createObjectStore('cards', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('links')) {
      db.createObjectStore('links', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('usage')) {
      db.createObjectStore('usage');
    }
  },
});

const defaultCards = [
  {
    id: '1',
    title: 'Sample Note',
    description: 'Demo card used for the UI prototype.',
    tags: ['demo', 'sample'],
    decks: [],
    type: 'text',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'JavaScript',
    description: 'Notes about JS.',
    tags: ['JavaScript', 'code'],
    decks: [],
    type: 'text',
    createdAt: new Date().toISOString(),
  },
];

export default function App() {
  const encrypt = (str, key) => {
    if (!key) return str;
    return CryptoJS.AES.encrypt(str, key).toString();
  };
  const decrypt = (str, key) => {
    if (!key) return str;
    try {
      const bytes = CryptoJS.AES.decrypt(str, key);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch {
      return str;
    }
  };
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
  const importRef = useRef();
  const loadCards = async () => {
    const db = await dbPromise;
    const store = db.transaction('cards').objectStore('cards');
    const all = await store.getAll();
    return all
      .map(({ data }) => {
        try {
          return JSON.parse(decrypt(data, encKey));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  };

  const saveCards = async list => {
    const db = await dbPromise;
    const tx = db.transaction('cards', 'readwrite');
    const store = tx.objectStore('cards');
    await store.clear();
    for (const card of list) {
      const data = encrypt(JSON.stringify(card), encKey);
      await store.put({ id: card.id, data });
    }
  };

  const loadLinks = async () => {
    const db = await dbPromise;
    const store = db.transaction('links').objectStore('links');
    const all = await store.getAll();
    return all
      .map(({ data }) => {
        try {
          return JSON.parse(decrypt(data, encKey));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  };

  const saveLinks = async list => {
    const db = await dbPromise;
    const tx = db.transaction('links', 'readwrite');
    const store = tx.objectStore('links');
    await store.clear();
    for (const link of list) {
      const data = encrypt(JSON.stringify(link), encKey);
      await store.put({ id: link.id, data });
    }
  };

  const loadUsage = async () => {
    const db = await dbPromise;
    const store = db.transaction('usage').objectStore('usage');
    const keys = await store.getAllKeys();
    const result = {};
    for (const key of keys) {
      const val = await store.get(key);
      try {
        result[key] = JSON.parse(decrypt(val, encKey));
      } catch {
        result[key] = 0;
      }
    }
    return result;
  };

  const saveUsage = async map => {
    const db = await dbPromise;
    const tx = db.transaction('usage', 'readwrite');
    const store = tx.objectStore('usage');
    await store.clear();
    for (const [key, val] of Object.entries(map)) {
      const data = encrypt(JSON.stringify(val), encKey);
      await store.put(data, key);
    }
  };

  const migrateLocalStorage = async () => {
    const db = await dbPromise;
    const count = await db.count('cards');
    if (count > 0) return;
    const legacyCards = localStorage.getItem('cards');
    const legacyLinks = localStorage.getItem('links');
    const legacyUsage = localStorage.getItem('usage');
    if (legacyCards) {
      try {
        await saveCards(JSON.parse(legacyCards));
      } catch { /* ignore */ }
      localStorage.removeItem('cards');
    }
    if (legacyLinks) {
      try {
        await saveLinks(JSON.parse(legacyLinks));
      } catch { /* ignore */ }
      localStorage.removeItem('links');
    }
    if (legacyUsage) {
      try {
        await saveUsage(JSON.parse(legacyUsage));
      } catch { /* ignore */ }
      localStorage.removeItem('usage');
    }
  };

  useEffect(() => {
    get('encryptionKey').then(k => setEncKey(k || ''));
    get('aiEnabled').then(v => setAiEnabled(v === undefined ? true : v));
    get('webSuggestionsEnabled').then(v => setWebSuggestionsEnabled(v === undefined ? true : v));
    get('theme').then(t => t && setTheme(t));
    get('tagPalette').then(p => {
      if (p) {
        setTagPalette(p);
        setTagPaletteCache(p);
      }
    });
    get('cardBg').then(c => c && setCardBg(c));
    get('cardBorder').then(c => c && setCardBorder(c));
    get('accent').then(c => c && setAccent(c));
    get('textColor').then(c => c && setTextColor(c));
    get('font').then(f => f && setFont(f));
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', accent);
  }, [accent]);
  useEffect(() => {
    document.documentElement.style.setProperty('--text-color', textColor);
  }, [textColor]);
  useEffect(() => {
    document.documentElement.style.setProperty('--font-family', font);
  }, [font]);

  useEffect(() => {
    async function init() {
      await migrateLocalStorage();
      try {
        const res = await fetch('/api/cards');
        if (res.ok) {
          const data = await res.json();
          const cs = (data.cards || []).map(c => {
            c.decks = c.decks || [];
            return c;
          });
          setCards(cs);
          await saveCards(cs);
          setLinks(data.links || []);
          await saveLinks(data.links || []);
          setUsage(await loadUsage());
          return;
        }
      } catch {
        // ignore
      }
      let stored = await loadCards();
      if (!stored.length) {
        stored = defaultCards;
        await saveCards(stored);
      }
      stored = stored.map(c => {
        if (c.deck && !c.decks) {
          c.decks = [c.deck];
          delete c.deck;
        }
        c.decks = c.decks || [];
        return c;
      });
      setCards(stored);
      setLinks(await loadLinks());
      setUsage(await loadUsage());
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encKey]);
  useEffect(() => {
    if (aiEnabled && useSemantic && query.trim()) {
      fetch('/api/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      })
        .then(r => r.json())
        .then(setSemanticResults)
        .catch(() => setSemanticResults([]));
    } else {
      setSemanticResults([]);
    }
  }, [aiEnabled, query, useSemantic]);

  useEffect(() => {
    set('aiEnabled', aiEnabled);
    set('webSuggestionsEnabled', webSuggestionsEnabled);
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiEnabled, webSuggestionsEnabled }),
    }).catch(() => {});
    if (!aiEnabled) {
      setUseSemantic(false);
    }
  }, [aiEnabled, webSuggestionsEnabled]);
  useEffect(() => {
    set('theme', theme);
  }, [theme]);
  const fuse = useMemo(() => new Fuse(cards, { keys: ['title', 'description', 'tags'], threshold: 0.3 }), [cards]);
  const filtered = useMemo(() => {
    const base = useSemantic && query.trim()
      ? semanticResults
      : query.trim() ? fuse.search(query.trim()).map(r => r.item) : cards;
    return base.filter(c =>
      (deckFilter ? c.decks?.includes(deckFilter) : true) &&
      (tagFilter ? c.tags.includes(tagFilter) : true)
    );
  }, [cards, fuse, query, deckFilter, tagFilter, useSemantic, semanticResults]);

  const decks = cards.reduce((acc, c) => {
    (c.decks || []).forEach(d => {
      acc[d] = (acc[d] || 0) + 1;
    });
    return acc;
  }, {});
  const tagOptions = Array.from(new Set(cards.flatMap(c => c.tags || [])));
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const titleMatches = fuse.search(query.trim()).slice(0, 5).map(r => r.item.title);
    const tagMatches = cards
      .flatMap(c => c.tags || [])
      .filter(t => t.toLowerCase().includes(query.toLowerCase()));
    return Array.from(new Set([...titleMatches, ...tagMatches])).slice(0, 5);
  }, [query, fuse, cards]);

  const selectCard = card => {
    setSelected(card);
    setUsage(prev => {
      const next = { ...prev, [card.id]: (prev[card.id] || 0) + 1 };
      return next;
    });
    fetch(`/api/cards/${card.id}/usage`, { method: 'POST' }).catch(() => {});
  };

  const addCard = data => {
    const newCard = {
      id: String(Date.now()),
      tags: [],
      decks: [],
      createdAt: new Date().toISOString(),
      ...data,
    };
    setCards(prev => {
      const next = [...prev, newCard];
      saveCards(next);
      return next;
    });
  };

  const editCard = card => {
    const title = prompt('Edit title', card.title);
    if (title === null) return;
    const description = prompt('Edit description', card.description || '');
    if (description === null) return;
    const tagsStr = prompt(
      'Edit tags (comma separated)',
      (card.tags || []).join(',')
    );
    if (tagsStr === null) return;
    const decksStr = prompt(
      'Edit decks (comma separated)',
      (card.decks || []).join(',')
    );
    if (decksStr === null) return;
    const tags = tagsStr
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    const decks = decksStr
      .split(',')
      .map(d => d.trim())
      .filter(Boolean);
    setCards(prev => {
      const next = prev.map(c =>
        c.id === card.id ? { ...c, title, description, tags, decks } : c
      );
      saveCards(next);
      return next;
    });
  };

  const deleteCard = id => {
    setCards(prev => {
      const next = prev.filter(c => c.id !== id);
      saveCards(next);
      return next;
    });
    setLinks(prev => {
      const next = prev.filter(l => l.from !== id && l.to !== id);
      saveLinks(next);
      return next;
    });
    setUsage(prev => {
      const next = { ...prev };
      delete next[id];
      saveUsage(next);
      return next;
    });
  };

  const handleSuggestionAdd = s => {
    addCard({
      title: s.title,
      description: s.description,
      tags: [s.tag || 'suggested'],
    });
  };

  const handleSuggestionEdit = s => {
    setQuickAddInitial(s.title);
  };

  const handleLinkCreate = (from, to, type, annotation) => {
    fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, type, annotation })
    })
      .then(r => r.json())
      .then(link => {
        setLinks(prev => {
          const next = [...prev, link];
          saveLinks(next);
          return next;
        });
      })
      .catch(err => console.error(err));
  };

  const handleLinkEdit = (id, type, annotation) => {
    fetch(`/api/links/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, annotation })
    })
      .then(r => r.json())
      .then(link => {
        setLinks(prev => {
          const next = prev.map(l => (l.id === id ? link : l));
          saveLinks(next);
          return next;
        });
      })
      .catch(err => console.error(err));
  };

  const toggleWebSuggestions = () => {
    setWebSuggestionsEnabled(prev => !prev);
  };

  const handleSetKey = () => {
    const k = prompt('Set encryption key', encKey);
    if (k !== null) {
      setEncKey(k);
      set('encryptionKey', k);
      saveCards(cards);
      saveLinks(links);
      saveUsage(usage);
    }
  };

  useEffect(() => {
    saveUsage(usage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usage]);

  const exportData = () => {
    fetch('/api/export')
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'memory-export.zip';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(err => console.error(err));
  };

  const importData = e => {
    const file = e.target.files[0];
    if (!file) return;
    file.arrayBuffer().then(buf => {
      fetch('/api/import', { method: 'POST', body: buf })
        .then(() => fetch('/api/cards'))
        .then(r => r.json())
        .then(data => {
          const cs = (data.cards || []).map(c => ({ ...c, decks: c.decks || [] }));
          setCards(cs);
          saveCards(cs);
          setLinks(data.links || []);
          saveLinks(data.links || []);
        })
        .catch(err => console.error(err));
    });
    importRef.current.value = '';
  };

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('cardCreated', e => {
      const card = JSON.parse(e.data);
      setCards(prev => {
        const next = [...prev, card];
        saveCards(next);
        return next;
      });
    });
    es.addEventListener('cardUpdated', e => {
      const card = JSON.parse(e.data);
      setCards(prev => {
        const next = prev.map(c => (c.id === card.id ? card : c));
        saveCards(next);
        return next;
      });
    });
    es.addEventListener('cardRemoved', e => {
      const { id } = JSON.parse(e.data);
      setCards(prev => {
        const next = prev.filter(c => c.id !== id);
        saveCards(next);
        return next;
      });
    });
    return () => es.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={theme === 'dark' ? 'dark flex bg-gray-900 text-white min-h-screen' : 'flex min-h-screen'}>
      <DeckSidebar decks={decks} current={deckFilter} onSelect={setDeckFilter} />
      <div className="p-4 flex-1">
        <div className="mb-4 flex items-center space-x-2">
          <label htmlFor="search" className="sr-only">Search cards</label>
          <div className="relative flex-1 max-w-md">
            <input
              id="search"
              type="text"
              placeholder="Search cards..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="border p-2 w-full"
              aria-autocomplete="list"
              aria-controls="search-suggestions"
            />
            {suggestions.length > 0 && (
              <ul
                id="search-suggestions"
                role="listbox"
                className="absolute z-10 bg-white dark:bg-gray-800 border mt-1 w-full max-h-40 overflow-auto"
              >
                {suggestions.map(s => (
                  <li key={s}>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setQuery(s)}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label htmlFor="tag-filter" className="sr-only">Filter by tag</label>
          <select
            id="tag-filter"
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            className="border p-2"
          >
            <option value="">All Tags</option>
            {tagOptions.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={e => setAiEnabled(e.target.checked)}
              className="mr-1"
            />
            AI
          </label>
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={useSemantic}
              onChange={e => setUseSemantic(e.target.checked)}
              className="mr-1"
              disabled={!aiEnabled}
            />
            Semantic
          </label>
          <button className="border px-2" onClick={() => setShowGraph(g => !g)}>Graph</button>
          <button className="border px-2" onClick={handleSetKey}>Encrypt</button>
          <button className="border px-2" onClick={exportData}>Export</button>
          <button className="border px-2" onClick={() => importRef.current.click()}>Import</button>
          <input type="file" ref={importRef} onChange={importData} className="hidden" />
        </div>
        <ThemeSettings
          theme={theme}
          setTheme={setTheme}
          tagPalette={tagPalette}
          setTagPalette={p => {
            setTagPalette(p);
            set('tagPalette', p);
            setTagPaletteCache(p);
          }}
          cardBg={cardBg}
          setCardBg={c => {
            setCardBg(c);
            set('cardBg', c);
          }}
          cardBorder={cardBorder}
          setCardBorder={c => {
            setCardBorder(c);
            set('cardBorder', c);
          }}
          accent={accent}
          setAccent={c => {
            setAccent(c);
            set('accent', c);
          }}
          textColor={textColor}
          setTextColor={c => {
            setTextColor(c);
            set('textColor', c);
          }}
          font={font}
          setFont={f => {
            setFont(f);
            set('font', f);
          }}
        />
        <QuickAdd onAdd={addCard} initial={quickAddInitial} aiEnabled={aiEnabled} />
        {showGraph ? (
          <GraphView
            cards={cards}
            links={links}
            onLink={handleLinkCreate}
            onLinkEdit={handleLinkEdit}
            cardBg={cardBg}
            cardBorder={cardBorder}
          />
        ) : (
          <CardGrid
            cards={filtered}
            onSelect={selectCard}
            onEdit={editCard}
            onDelete={deleteCard}
            cardBg={cardBg}
            cardBorder={cardBorder}
            highlight={query}
          />
        )}
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-2 flex items-center">
            Suggestions
            <label className="ml-2 text-sm">
              <input
                type="checkbox"
                checked={webSuggestionsEnabled}
                onChange={toggleWebSuggestions}
                className="mr-1"
              />
              Enable web
            </label>
          </h2>
          <SuggestionsList
            card={selected}
            cards={cards}
            enabled={webSuggestionsEnabled}
            onAdd={handleSuggestionAdd}
            onEdit={handleSuggestionEdit}
          />
        </div>
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-2">Chatbot</h2>
          <Chatbot />
        </div>
      </div>
    </div>
  );
}
