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
