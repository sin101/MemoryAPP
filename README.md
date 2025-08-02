# MemoryAPP

This repository contains a small prototype of a personal content manager based on the accompanying specification.

## Development

The current implementation is a minimal Node.js library that can create cards, organize them into decks and perform simple tag-based and text-based search. Cards include a type, creation date, and optional description. A lightweight enrichment routine can automatically generate tags and a short description from the card content and may be disabled for an offline-only experience. Cards can be updated, linked together, removed safely, and the library will keep deck, link, and tag references in sync. Decks may also be removed while cleaning up card references. Data can be exported to or imported from JSON files for simple local persistence, and graph-friendly node/edge data can be generated for visualizing links between cards.
The graph helper can filter by deck, tag, or link type and includes each card's deck memberships.

Cards now receive simple input processing: when AI features are enabled the content or source is summarized and a placeholder illustration filename is generated. Each card retains the original source (text, file path, URL, etc.) alongside a normalized `content` field, allowing the app to track any type of material—from images and audio to videos and web links. The AI layer is pluggable, allowing integration with external language or image models to supply custom summaries and illustrations, and a lightweight chatbot can answer natural-language queries to help locate cards. A tiny SQLite-backed store can also persist cards to disk and reload them on startup.

An event system makes the prototype dynamic and responsive. `MemoryApp` emits `cardCreated`, `cardUpdated`, `cardRemoved`, `deckRemoved`, and `cardProcessed` events so external interfaces can react to changes. For even snappier interactions, construct the app with `{ backgroundProcessing: true }` to defer AI work; creation and updates will return immediately and a `cardProcessed` event will fire once summarization and illustration generation finish.

When a `HUGGINGFACE_API_KEY` environment variable is present, the app will query the Hugging Face Hub to pick popular models for summarization, chat, and image generation. These selections are cached at runtime and used for rich summaries, chatbot answers, and illustrative images. Without the key, a simple heuristic AI remains available for offline use.

The prototype also experiments with web suggestions: when enabled, the app will gather card tags and query public sources such as RSS feeds and Reddit to propose related content, with YouTube used for video cards and ArXiv for academic material. Suggestions can be turned off for privacy or offline use. The API now exposes helpers to retrieve recommendations for a selected card or to surface theme suggestions from the most common tags. A small static demo in the `public/` folder presents a Pokémon-style card layout and populates a suggestion list using these sources whenever a card or theme is selected.

### Running tests

```
npm test
```
