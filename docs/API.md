# API Reference

## MemoryApp

### `setExternalCallsEnabled(enabled)`
Enable or disable all external network features including AI and suggestions.

### `enableLogging(path)`
Write app events to the given log file.

### `saveEncryptedToFile(path, password)` / `loadEncryptedFromFile(path, password)`
Persist card data encrypted with a password.

### `saveMedia(buffer, filename)`
Store a media file under the `storage/` directory.

### `exportZip(path)` / `importZip(path)`
Export or import cards and stored media as a ZIP archive.
