# Developer Setup

Install dependencies and run tests:

```
npm install
npm test
```

The frontend lives under `frontend/` and can be started with:

```
npm run frontend:dev
```

An Electron entry point is provided in `desktop/main.js`.

To produce packaged desktop binaries for Windows, macOS, and Linux:

```
npm run desktop:build
```

This runs the frontend build and then packages the application with `electron-builder`. The output will be written to `dist-desktop/`.

## Real-time events

The server exposes card lifecycle events over a Server-Sent Events stream at `/api/events`. Clients can connect with the browser's `EventSource` API and listen for `cardCreated`, `cardUpdated`, and `cardRemoved` messages to update their state without polling.

## Semantic search index

Card embeddings are organized using a simple locality-sensitive hash. Queries hash the embedding vector and only compare against cards in the matching bucket for faster semantic lookup on large datasets.
