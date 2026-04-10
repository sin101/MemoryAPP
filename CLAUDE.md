# CLAUDE.md — MemoryAPP Codebase Guide

This file gives Claude Code the full context needed to work on MemoryAPP without losing track across sessions.

---

## Project Summary

MemoryAPP is an offline-first personal content manager. Users capture cards (text, URLs, images, PDFs, audio, video), organize them into decks, and retrieve them via fuzzy/semantic search. AI enrichment (tags, summaries, illustrations) runs locally or via Pollinations.ai (free, no key). Data is persisted in SQLite server-side and IndexedDB (AES-encrypted) client-side.

**Stack**: TypeScript/Express backend · React/Vite frontend · SQLite · IndexedDB · Pollinations.ai · youtube-transcript · Fuse.js

---

## Quick Commands

```bash
# Development
npm start                    # Backend on :3000
npm run frontend:dev         # Frontend dev server on :5173 (proxies /api → :3000)

# Build
npm run build                # Compile TypeScript → dist/
npm run frontend:build       # Vite production build

# Validate
npm test                     # Build + run test.ts
npm run lint --prefix frontend  # ESLint on frontend

# Process management
npm run app:start            # Both processes via start.sh (writes PIDs to .backend.pid / .frontend.pid)
npm run app:stop             # Kill via stop.sh
kill $(cat .backend.pid)     # Manual kill if needed
```

---

## File Map

### Backend `src/`

| File | Role |
|------|------|
| `server.ts` | Express API — all HTTP endpoints, SSE, middleware (Helmet, compression, rate limit, auth) |
| `app.ts` | Core `MemoryApp` class — card/deck/link CRUD, tag index, LSH semantic index, smart decks, event emission |
| `card.ts` | `Card` class — model, normalization, `searchText` generation |
| `deck.ts` | `Deck` class — name normalization, card set |
| `link.ts` | `Link` class — directional card relationships |
| `db.ts` | SQLite wrapper — optional AES encryption, FTS5 full-text search, save/load |
| `ai.ts` | AI provider abstraction — `SimpleAI` (offline heuristics), `HuggingFaceAI`, `TransformersAI`, Pollinations image/vision |
| `aiWorker.ts` | Worker thread for expensive AI tasks (embed, summarize, illustrate) — keeps server non-blocking |
| `contentAnalyzer.ts` | TextRank extractive summarization · TF-IDF RAKE keyword extraction · topic classification |
| `contentExtractor.ts` | YouTube transcript fetching (youtube-transcript pkg) · HTML→plaintext extraction |
| `urlFetcher.ts` | URL type detection (youtube/tweet/article/link) · OG tag extraction · oEmbed |
| `suggestions.ts` | Server-side suggestion caching from Wikipedia/Reddit/ArXiv/RSS/YouTube |
| `config.ts` | Env var config (`ENCRYPTION_KEY`, `API_TOKEN`, `DB_PATH`, `PORT`, etc.) |
| `logger.ts` | Pino JSON logger |
| `types.ts` | Shared TypeScript interfaces (`CardData`, `AIProvider`, `AppOptions`) |

### Frontend `frontend/src/`

| File | Role |
|------|------|
| `App.jsx` | Root component — all state, IndexedDB sync (optimistic load → server sync), SSE listener, card ops |
| `components/CardGrid.jsx` | CSS grid of `MiniCard`s + SVG relation lines (shared-tag edges) + `CardTooltip` on hover |
| `components/QuickAdd.jsx` | Content ingestion — URL/file/paste/drop → AI analysis → preview → save |
| `components/CardDetailModal.jsx` | Full card view — top 10 tags displayed, `+N more data points` collapsible |
| `components/EditCardModal.jsx` | Inline editor for title/tags/decks/description |
| `components/SuggestionsList.jsx` | Three-layer suggestions: related local cards · Pollinations AI recs · web lookups |
| `components/GraphView.jsx` | React Flow force-directed graph of linked cards |
| `components/DeckSidebar.jsx` | Deck list + smart decks (Recent/Frequent/Unseen/Stale + tag: decks) |
| `components/Chatbot.jsx` | Natural-language card search via `/api/chat` |
| `components/ThemeSettings.jsx` | Color/font pickers, light/dark toggle |
| `components/Modal.jsx` | Reusable modal wrapper |
| `pdfExtractor.js` | PDF→text via pdfjs-dist |
| `suggestions.js` | Browser-side suggestion fetchers (Wikipedia, Reddit, RSS, YouTube, ArXiv) |
| `tagColors.js` | Deterministic tag→color palette |

---

## Architecture & Data Flow

```
Browser (React)
  │
  ├─ IndexedDB (AES-encrypted cards/links/usage) — optimistic load on startup
  ├─ EventSource /api/events — real-time SSE updates from server
  └─ fetch /api/* — REST for mutations
       │
       Express server (port 3000)
         │
         ├─ MemoryApp — in-memory card store, tag index, LSH index, event emitter
         ├─ SQLite (optional, DB_PATH env) — persisted storage with optional AES
         ├─ AI Worker Thread — non-blocking summarize/embed/illustrate
         └─ External: Pollinations.ai (free), youtube-transcript, Wikipedia, Reddit
```

**Dual-storage model:**
- Server: SQLite (optional encryption). If `DB_PATH` not set, all data is in-memory only (lost on restart).
- Frontend: IndexedDB with CryptoJS AES. Key is user-entered string (plain, not hashed). Stored in component state via `encKeyRef`.
- Offline fallback: App loads from IndexedDB immediately, then syncs from server in the background.

**SSE events emitted by server:** `cardCreated`, `cardUpdated`, `cardRemoved`, `cardProcessed`, `deckCreated`, `deckRemoved`, `linkCreated`, `linkUpdated`, `linkRemoved`

---

## Data Models

### Card (stored in `card.tags` as `string[]`, all 25 tags)
```typescript
interface CardData {
  id: string;
  title: string;
  content?: string;           // Full text content / transcript
  source: string;             // URL, filename, or raw data
  tags: string[];             // ALL tags stored here (up to 25); top 10 displayed in UI
  decks: string[];
  type: string;               // 'text'|'image'|'video'|'audio'|'link'|'youtube'|'tweet'|'article'
  description?: string;
  createdAt: string;          // ISO timestamp
  summary?: string;           // AI-generated TextRank extractive summary
  illustration?: string;      // Pollinations image URL or SVG
  image?: string;             // User-provided image (base64 or URL)
  contentType?: string;       // MIME type
  duration?: number;          // Audio/video seconds
  embedding?: number[];       // Vector (26-dim SimpleAI or 384-dim MiniLM)
}
```

### Tag system — 25 tags per card
- Top 10: displayed in UI (colored pills in MiniCard tooltip and CardDetailModal)
- Tags 11-25: hidden data points — used by all backend logic (tag index, deck creation, relation lines, search, suggestions)
- ALL tags indexed in `tagIndex: Map<string, Set<cardId>>` in app.ts
- Tag-based auto-decks created for any tag shared by ≥ 2 cards

### Smart Decks (auto-generated in `_updateSmartDecks`)
- `recent`: cards added in last 7 days
- `frequent`: top 10% most-accessed
- `unseen`: count === 0
- `stale`: not opened in 30+ days
- `tag:{name}`: auto-created for any tag with ≥ 2 cards

---

## API Endpoints

### Cards
| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/cards` | All cards (pagination: `?offset=&limit=`) |
| `POST` | `/api/cards` | Create card (Zod validated) |
| `PUT` | `/api/cards/:id` | Update card |
| `DELETE` | `/api/cards/:id` | Delete card (cascades decks/links) |
| `POST` | `/api/cards/batch` | Batch create |
| `POST` | `/api/cards/:id/usage` | Record view (increments stats) |

### Content Ingestion
| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/clip` | URL → fetch meta + full content → create card with tags |
| `GET` | `/api/fetch-url` | URL metadata only (no full content); `?url=` param |
| `GET` | `/api/youtube-transcript` | Transcript text; `?v={videoId}`; 30-min cache |
| `POST` | `/api/audio-note` | Base64 audio → transcribe → card |
| `POST` | `/api/video-note` | Base64 video → card |
| `POST` | `/api/analyze` | Tag extraction + topic; body `{text, type}`; LRU cached (200 entries, 5 min) |
| `GET` | `/api/media/*` | Serve stored audio/video files |

### Search & Suggestions
| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/search/text` | Fuse.js fuzzy search |
| `POST` | `/api/search/semantic` | LSH embedding search |
| `GET` | `/api/cards/:id/suggestions` | Related cards (tag-overlap) |
| `GET` | `/api/suggestions/web` | Web suggestions (Wikipedia/Reddit/ArXiv) |

### AI
| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/illustrate` | Generate image/SVG from prompt |
| `POST` | `/api/chat` | Natural-language query |

### Graph, Decks, Links, Import/Export, Settings — standard CRUD (see server.ts)

---

## Key Patterns

### Tag Generation Pipeline (QuickAdd)
1. Parallel: RAKE via `/api/analyze` + Pollinations LLM (browser, no key)
2. For YouTube URLs: fetch `/api/youtube-transcript` → analyze full transcript text
3. For images/video: Pollinations vision API (browser-side) → RAKE on description
4. Merge: AI tags first (10 quality tags), RAKE to fill up to 25 total
5. `setSuggestedTags(all25)` — top 10 auto-selected, rest collapsed as "additional data points"
6. `card.tags` stores ALL 25; UI displays top 10

### Analysis Caching (server.ts)
```typescript
// LRU cache: MD5 hash of "type:text.slice(0,500)" → {result, ts}
// 200 entries, 5 min TTL, evicts oldest on overflow
```

### Transcript Cache (server.ts)
```typescript
// Map videoId → {text, ts}, 100 entries, 30 min TTL
```

### Frontend Offline-First Init (App.jsx)
```javascript
// 1. Load from IndexedDB immediately (shows local cards)
// 2. Fetch from server in background
// 3. Update state + re-save to IndexedDB if server responds
// 4. If server unreachable, keep local cards (no defaultCards shown if real data exists)
```

### SSE Update Handling (App.jsx)
```javascript
// cardUpdated events: skip IDB save if summary/illustration/tags unchanged
// encKeyRef used in callbacks to avoid stale closure over encKey state
```

### Relation Lines (CardGrid.jsx)
```javascript
// computeEdges: shared tags between visible cards → max 3 edges per card by strength
// SVG overlay drawn on top of CSS grid; positions measured via getBoundingClientRect
// Active edges (hovered card) use tag color; inactive = gray dashed
```

### Pollinations.ai Usage
- **Text API** (`text.pollinations.ai/openai`): Called browser-side for tag extraction and suggestions. Model: `openai-large`. Guard against deprecation notice in response.
- **Vision API** (same endpoint + `image_url`): Browser-side image/video frame analysis. No API key needed.
- **Image generation**: URL pattern `https://image.pollinations.ai/prompt/{encoded}` — server-side in `ai.ts`.
- **IMPORTANT**: Server-side calls to Pollinations text API return 403/deprecation notices. Always call from browser.

### IndexedDB Encryption (App.jsx)
```javascript
// encrypt(JSON.stringify(card), encKey) → store
// decrypt(data, encKey) → JSON.parse
// encKey is user-entered plain string; stored in state + encKeyRef for callbacks
```

---

## What NOT to Do

- **Never call Pollinations text/vision API from server-side** — it blocks or returns deprecation HTML. Use browser-side fetch only.
- **Don't slice tags to 10 before storing** — store all 25; slicing is display-only.
- **Don't re-render Fuse on every card change** — use `cardSignature` (title+desc+tags join) as the memo dependency.
- **Don't call `setBothPending` synchronously** after async analysis — check for AbortError before setState.
- **Don't use `file_path` parameter in Grep tool** — use `path` parameter instead.
- **Don't use react-window for CardGrid** — CSS grid is required so we can measure card DOM positions for SVG relation lines.
- **Don't break SSE** — the frontend EventSource reconnects automatically; server must send heartbeat comments every 30s.
- **Pollinations responses**: Always check `content.includes('IMPORTANT NOTICE') || content.includes('deprecated')` before parsing.

---

## Implemented Features (Current State — April 2026)

### Content Ingestion
- [x] Text/URL/paste/drag-drop/file upload (image, video, audio, PDF, txt, csv, json)
- [x] YouTube URL → oEmbed metadata + full transcript for analysis
- [x] Image → Pollinations vision analysis (description, tags, extracted text)
- [x] Video file → first-frame extraction + vision analysis
- [x] PDF → pdfjs-dist text extraction
- [x] Audio → base64 upload + transcription

### AI Enrichment
- [x] TextRank extractive summarization (offline, server-side)
- [x] TF-IDF RAKE tag extraction (offline, server-side) — 25 tags per card
- [x] Pollinations LLM tag extraction (browser-side, free, no key)
- [x] Topic classification (15 categories, keyword matching)
- [x] Illustration generation (Pollinations image.pollinations.ai)
- [x] Tags auto-selected when generated (top 10 selected, rest stored)

### Card Grid & Visualization
- [x] CSS grid mini-cards (auto-fill minmax 160px)
- [x] Hover tooltip (image, title, domain, summary, tags, date)
- [x] SVG relation lines between cards sharing tags (max 3 per card)
- [x] Related cards highlighted on hover (blue ring)
- [x] Relation lines use tag color when active

### Organization
- [x] Decks (manual + auto tag-based: ≥2 cards per tag)
- [x] Smart decks: Recent (7d), Frequent (top 10%), Unseen, Stale (30d)
- [x] Tag filter + deck filter + fuzzy search
- [x] Semantic search (LSH on embeddings)

### Suggestions
- [x] Related local cards (sharing ≥2 tags)
- [x] Pollinations AI resource recommendations (4 per card)
- [x] Web lookups: Wikipedia/Reddit/RSS (up to 5 tags)
- [x] Source badges + Add/Edit/Ignore actions

### Persistence & Sync
- [x] IndexedDB (AES encrypted) — optimistic load on startup
- [x] SQLite server-side (optional encryption, optional DB_PATH)
- [x] SSE real-time sync across tabs/clients
- [x] Offline-first: local cards shown immediately, server sync in background

### Tags Display
- [x] Top 10 tags: displayed on cards (colored pills)
- [x] Tags 11-25: hidden data points stored in `card.tags`; used for matching/decks/search/relation lines
- [x] CardDetailModal: `+N more data points` collapsible section
- [x] QuickAdd: primary (top 10, auto-selected) + "additional data points" collapsed section

---

## Planned / Not Yet Implemented

See SPEC.md for full roadmap. Key outstanding items:

- [ ] Spatial canvas layout (drag cards to position them in 2D space)
- [ ] Gesture/swipe navigation (mobile)
- [ ] Cross-device sync (cloud backend option)
- [ ] Community / shared decks
- [ ] Browser extension clipper improvements
- [ ] Better mobile responsive layout
- [ ] Card merging / deduplication
- [ ] Batch tag editing across multiple cards
- [ ] Full-text search across card content (not just title/description)
- [ ] Export to Obsidian / Notion / Anki formats
- [ ] Spaced repetition deck mode

---

## Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `3000` | Server port |
| `DB_PATH` | (none = in-memory) | SQLite file path |
| `ENCRYPTION_KEY` | (none) | AES key for server-side SQLite encryption |
| `API_TOKEN` | (none) | Bearer token for API auth (optional) |
| `HUGGINGFACE_API_KEY` | (none) | Enables HF API models |
| `LOG_PATH` | (none) | Pino log file |
| `RATE_LIMIT_MAX` | `100` | Requests/minute |

---

## Coding Conventions

- 2-space indentation everywhere
- TypeScript strict mode (backend)
- React functional components + hooks only (no class components)
- `useCallback` / `useMemo` for all handlers and derived state in App.jsx and CardGrid.jsx
- `memo()` on CardGrid, MiniCard, CardTooltip
- No inline styles except for dynamic values (colors, positions from state)
- Tailwind for all styling; dark mode via `dark:` prefix
- Never commit `.env` or secrets
- Zod validation on all API request bodies
