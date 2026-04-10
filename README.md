# MemoryAPP

An offline-first personal content manager. Capture anything — text, URLs, images, PDFs, audio, video — enrich it with AI-generated tags and summaries, organize into decks, and retrieve via fuzzy or semantic search.

## Features

### Content Capture
- Paste, drag-and-drop, or type URLs directly into the quick-add bar
- YouTube URLs → full transcript fetched and analyzed (not just title/description)
- Images → Pollinations vision analysis (scene, objects, colors, text, brands)
- Video files → first-frame extraction + vision analysis
- PDFs → full text extraction via pdfjs-dist
- Audio/video files uploaded as base64 media notes

### AI Enrichment (offline-capable, no API keys required)
- **25 tags per card**: top 10 displayed; all 25 used for search, matching, deck creation, relation lines, and suggestions
- TextRank extractive summarization (fully offline)
- TF-IDF RAKE keyword extraction (fully offline)
- Pollinations.ai LLM tag generation (free, no key, browser-side)
- Illustration generation via Pollinations image model
- Topic classification across 15 categories

### Card Grid
- Mini-card grid with hover tooltips (image, summary, tags, date)
- SVG relation lines between cards sharing tags (top 3 connections per card)
- Related cards highlighted on hover with blue ring
- Click to open full card detail

### Organization
- Manual decks + automatic tag-based decks (any tag shared by ≥2 cards)
- Smart decks: Recent (7d), Frequent (top 10%), Unseen, Stale (30d)
- Tag filter, deck filter, fuzzy search (Fuse.js), semantic search (LSH embeddings)

### Suggestions Panel (per selected card)
- **Related local cards** — cards sharing ≥2 tags
- **AI recommendations** — Pollinations generates 4 specific resource links
- **Web lookups** — Wikipedia, Reddit, RSS using up to 5 card tags

### Persistence & Sync
- IndexedDB with AES encryption (client-side key, offline-first)
- SQLite server-side (optional, set `DB_PATH` env var)
- Optimistic load: local cards shown immediately on startup, server syncs in background
- Real-time sync via Server-Sent Events across tabs/clients

### Graph View
- React Flow force-directed graph of linked cards
- Drag nodes; positions persisted in localStorage

---

## Quick Start

```bash
npm install
npm run frontend:build

# Start both server and frontend
npm run app:start

# Or separately in dev mode
npm start              # Backend on :3000
npm run frontend:dev   # Frontend on :5173 (proxies /api → :3000)
```

Open `http://localhost:5173` (dev) or `http://localhost:3000` (production build).

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Server port |
| `DB_PATH` | (in-memory) | SQLite file path for persistence |
| `ENCRYPTION_KEY` | (none) | AES key for server-side storage encryption |
| `API_TOKEN` | (none) | Bearer token for API authentication |
| `HUGGINGFACE_API_KEY` | (none) | Enables Hugging Face models for richer AI |
| `LOG_PATH` | (none) | JSON log file path |
| `RATE_LIMIT_MAX` | `100` | API requests per minute |

---

## Local Transformer Models (Optional)

For fully offline summarization and embeddings:

```bash
mkdir -p models/summarization models/embedding
npx @xenova/transformers-cli download --model Xenova/distilbart-cnn-6-6 --dir models/summarization
npx @xenova/transformers-cli download --model Xenova/all-MiniLM-L6-v2 --dir models/embedding
```

Without these, the app uses TextRank (offline) for summarization and heuristic embeddings for semantic search.

---

## Development

```bash
npm test                          # Build + run test suite
npm run lint --prefix frontend    # ESLint on frontend code
npm run build                     # Compile TypeScript
```

---

## Desktop Build (Electron)

```bash
npm run desktop:build
```

---

## Architecture

```
Browser (React + Vite)
  ├─ IndexedDB (AES encrypted) — optimistic offline load
  ├─ EventSource /api/events   — real-time SSE from server
  └─ fetch /api/*              — REST mutations
       │
       Express (port 3000)
         ├─ MemoryApp class   — in-memory cards/decks/links, tag index, LSH index
         ├─ SQLite (optional) — persistent storage
         ├─ AI Worker thread  — non-blocking summarize/embed/illustrate
         └─ Pollinations.ai   — image generation (server) + tag/vision (browser)
```

See [CLAUDE.md](CLAUDE.md) for the full developer guide including all API endpoints, data models, patterns, and coding rules.
