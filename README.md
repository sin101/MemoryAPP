# MemoryAPP

This repository contains a small prototype of a personal content manager based on the accompanying specification.

## Development

The current implementation is a minimal Node.js library that can create cards, organize them into decks and perform simple tag-based, text-based, and semantic search. Cards include a type, creation date, and optional description. A lightweight enrichment routine can automatically generate tags and a short description from the card content and may be disabled for an offline-only experience. Cards can be updated, linked together, removed safely, and the library will keep deck, link, and tag references in sync. Decks may also be removed while cleaning up card references. Data can be exported to or imported from JSON files for simple local persistence, and graph-friendly node/edge data can be generated for visualizing links between cards.
The graph helper can filter by deck, tag, or link type and includes each card's deck memberships.

Cards now receive simple input processing: when AI features are enabled the content or source is summarized and a placeholder illustration filename is generated. Each card retains the original source (text, file path, URL, etc.) alongside a normalized `content` field, allowing the app to track any type of material—from images and audio to videos and web links. Depending on the card type, audio and video sources are first transcribed and URLs have their main text extracted before summarization. The AI layer is pluggable, allowing integration with external language or image models to supply custom summaries and illustrations, and a lightweight chatbot can answer natural-language queries to help locate cards. A tiny SQLite-backed store can also persist cards to disk and reload them on startup.

Recent additions include optional encrypted export/import, ZIP archival of data and media, a simple logging facility, and an all-in-one toggle to disable external network access. The frontend prototype now registers as a PWA with a service worker and manifest, persists data in IndexedDB with AES encryption, supports drag-and-drop or pasted files via a quick add box—including image, video, and audio notes—displays suggestions with Add/Edit/Ignore/View actions, features a deck sidebar with Pokémon-style card theming, customizable tag palettes and themes, and offers an experimental graph view.

An event system makes the prototype dynamic and responsive. `MemoryApp` emits `cardCreated`, `cardUpdated`, `cardRemoved`, `deckRemoved`, and `cardProcessed` events so external interfaces can react to changes. For even snappier interactions, construct the app with `{ backgroundProcessing: true }` to defer AI work; creation and updates will return immediately and a `cardProcessed` event will fire once summarization and illustration generation finish.

When a `HUGGINGFACE_API_KEY` environment variable is present, the app will query the Hugging Face Hub to pick popular models for summarization, chat, speech recognition, and image generation. These selections are cached at runtime and used for rich summaries, chatbot answers, and illustrative images. Without the key, a simple heuristic AI remains available for offline use.

The prototype also experiments with web suggestions: when enabled, the app will gather card tags and query public sources such as RSS feeds and Reddit to propose related content, with YouTube used for video cards and ArXiv for academic material. Suggestions can be turned off for privacy or offline use. The API now exposes helpers to retrieve recommendations for a selected card or to surface theme suggestions from the most common tags. A small static demo in the `public/` folder presents a Pokémon-style card layout and populates a suggestion list using these sources whenever a card or theme is selected.

### YouTube API key

Video suggestions rely on the YouTube Data API. Provide a key by setting `window.YT_API_KEY` in your browser console, for example:

```js
window.YT_API_KEY = 'your-key-here';
```

If no key is present, the demo will prompt for one when a YouTube request is made.

### Local Transformers models

For offline summarization and text embeddings, you can download small models for use with [Transformers.js](https://github.com/xenova/transformers.js). The app checks for models in a local `models/` directory and uses them when available, otherwise it falls back to Hugging Face's hosted API if `HUGGINGFACE_API_KEY` is set.

```bash
mkdir -p models/summarization models/embedding
npx @xenova/transformers-cli download --model Xenova/distilbart-cnn-6-6 --dir models/summarization
npx @xenova/transformers-cli download --model Xenova/all-MiniLM-L6-v2 --dir models/embedding
```

Summarization uses `Xenova/distilbart-cnn-6-6` and embeddings use the MiniLM model `Xenova/all-MiniLM-L6-v2`.

### Running tests

```
npm test
```

### Desktop build

```
npm run desktop:pack
```
