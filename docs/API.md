# API Reference

## MemoryApp

### `setExternalCallsEnabled(enabled)`
Enable or disable all external network features including AI and suggestions.

### `enableLogging(path)`
Write app events to the given log file.

### `saveEncryptedToFile(path, password)` / `loadEncryptedFromFile(path, password)`
Persist card data encrypted with a password.

### `saveMedia(input, filename)`
Store a media file under the `storage/` directory. `input` may be a `Buffer`
or a path to an existing file; when a path is provided the file is moved into
storage without being fully read into memory.

### `exportZip(path)` / `importZip(path)`
Export or import cards and stored media as a ZIP archive.
