# User Manual

## Adding Content
Use the quick add box to type notes or drag files and images. Pasted screenshots are detected automatically. If no picture is supplied, a cartoon art-deco illustration is generated from your text using a Hugging Face model or a local SVG pattern.

## Navigating Decks
Select a deck from the sidebar to filter cards. Cards can be favorited directly from the grid. A **Recent** deck lists notes added in the past week, tags that appear frequently are promoted to their own smart decks automatically, a **Frequent** deck surfaces cards you've opened several times, an **Unseen** deck shows cards you haven't viewed yet, and a **Stale** deck highlights notes you haven't opened in a month.

## Graph View
Toggle the graph button to visualize card connections. Cards are arranged using a force-directed layout; drag nodes to rearrange and their positions are saved locally.

## Suggestions
Related web suggestions provide quick actions to add, edit, ignore or view each item.

The app can be installed as a PWA and works offline thanks to the included service worker. Use the accent, background, text color pickers, and font selector in the header to customize both light and dark themes.

## Web Clipper
The optional browser extension sends the current page, selection, and a screenshot to the local server. The screenshot becomes the card's illustration. Provide an API token for authenticated uploads. Clips are stored locally when offline and uploaded once connectivity is restored. The add-on targets both Chromium and Firefox thanks to a cross-browser manifest.
