# MemoryAPP

This repository contains a small prototype of a personal content manager based on the accompanying specification.

## Development

The current implementation is a minimal Node.js library that can create cards, organize them into decks and perform simple tag-based and text-based search. Cards include a type, creation date, and optional description. A lightweight enrichment routine can automatically generate tags and a short description from the card content and may be disabled for an offline-only experience. Cards can be updated, linked together, removed safely, and the library will keep deck, link, and tag references in sync. Decks may also be removed while cleaning up card references. Data can be exported to or imported from JSON files for simple local persistence, and graph-friendly node/edge data can be generated for visualizing links between cards.
The graph helper can filter by deck, tag, or link type and includes each card's deck memberships.

Cards now receive simple input processing: when AI features are enabled the content is summarized and a placeholder illustration filename is generated. A tiny SQLite-backed store can also persist cards to disk and reload them on startup.

The prototype also experiments with web suggestions: when enabled, the app will gather card tags and query the Wikipedia API to propose related content. Suggestions can be turned off for privacy or offline use.

### Running tests

```
npm test
```
