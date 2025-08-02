const Card = require('./card');
const Deck = require('./deck');
const Link = require('./link');
const fs = require('fs');
const MemoryDB = require('./db');
const { SimpleAI, HuggingFaceAI } = require('./ai');
const EventEmitter = require('events');

class MemoryApp extends EventEmitter {
  constructor(options = {}) {
    super();
    this.cards = new Map();
    this.decks = new Map();
    this.links = new Map();
    this.nextId = 1;
    this.nextLinkId = 1;
    this.aiEnabled = true;
    this.webSuggestionsEnabled = true;
    this.backgroundProcessing = !!options.backgroundProcessing;
    if (options.ai) {
      this.ai = options.ai;
    } else if (process.env.HUGGINGFACE_API_KEY) {
      this.ai = new HuggingFaceAI({ autoSelect: true });
    } else {
      this.ai = new SimpleAI();
    }
    this.db = options.dbPath ? new MemoryDB(options.dbPath) : null;
    if (this.db) {
      this.loadFromDB();
    }
  }

  async createCard(data) {
    if (!data.id) {
      data.id = String(this.nextId++);
    } else {
      const num = Number(data.id);
      if (!Number.isNaN(num) && num >= this.nextId) {
        this.nextId = num + 1;
      }
    }
    const card = new Card(data);
    this.cards.set(card.id, card);
    this.emit('cardCreated', card);
    await this._processAndPersistCard(card);
    return card;
  }

  setAIEnabled(enabled) {
    this.aiEnabled = enabled;
  }

  setWebSuggestionsEnabled(enabled) {
    this.webSuggestionsEnabled = enabled;
  }

  enrichCard(cardId) {
    if (!this.aiEnabled) {
      return null;
    }
    const card = this.cards.get(cardId);
    if (!card) {
      return null;
    }
    const basis = card.content || card.source || card.title;
    if (basis && card.tags.size === 0) {
      const words = Array.from(
        new Set(basis.toLowerCase().split(/\W+/).filter(w => w.length > 3))
      );
      for (const w of words.slice(0, 3)) {
        card.addTag(w);
      }
    }
    if (basis && !card.description) {
      card.description = basis.slice(0, 100);
    }
    return card;
  }

  getDeck(name) {
    if (!this.decks.has(name)) {
      this.decks.set(name, new Deck(name));
    }
    return this.decks.get(name);
  }

  addCardToDeck(cardId, deckName) {
    const card = this.cards.get(cardId);
    if (!card) {
      throw new Error('Card not found');
    }
    const deck = this.getDeck(deckName);
    deck.addCard(card);
    this.emit('deckUpdated', deck);
    if (this.db) {
      try {
        this.db.saveCard(card);
      } catch (e) {
        this.emit('error', e);
      }
    }
  }

  async updateCard(cardId, data) {
    const card = this.cards.get(cardId);
    if (!card) {
      return null;
    }
    card.update(data);
    this.emit('cardUpdated', card);
    await this._processAndPersistCard(card);
    return card;
  }

  async _processAndPersistCard(card) {
    if (this.aiEnabled) {
      this.enrichCard(card.id);
      if (this.backgroundProcessing) {
        this.processCard(card)
          .then(() => this.emit('cardProcessed', card))
          .catch(err => this.emit('error', err));
      } else {
        await this.processCard(card);
        this.emit('cardProcessed', card);
      }
    }
    if (this.db) {
      try {
        this.db.saveCard(card);
      } catch (e) {
        this.emit('error', e);
      }
    }
  }

  searchByTag(tag) {
    const results = [];
    for (const card of this.cards.values()) {
      if (card.tags.has(tag)) {
        results.push(card);
      }
    }
    return results;
  }

  searchByText(query) {
    const q = query.toLowerCase();
    const results = [];
    for (const card of this.cards.values()) {
      const title = (card.title || '').toLowerCase();
      const content = (card.content || '').toLowerCase();
      const description = (card.description || '').toLowerCase();
      if (title.includes(q) || content.includes(q) || description.includes(q)) {
        results.push(card);
      }
    }
    return results;
  }

  async fetchFromWikipedia(tag) {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(tag)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        return {
          tag,
          title: data.title,
          description: data.extract,
          url: (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) || `https://en.wikipedia.org/wiki/${encodeURIComponent(tag)}`,
          source: 'wikipedia',
        };
      }
    } catch (e) {
      // ignore network errors
    }
    return null;
  }

  async fetchFromReddit(tag) {
    try {
      const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(tag)}&limit=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'MemoryApp/1.0' } });
      if (res.ok) {
        const data = await res.json();
        const item = data && data.data && data.data.children && data.data.children[0] && data.data.children[0].data;
        if (item) {
          return {
            tag,
            title: item.title,
            description: item.selftext || '',
            url: `https://www.reddit.com${item.permalink}`,
            source: 'reddit',
          };
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  async fetchFromRSS(tag) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(tag)}`;
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        const match = text.match(/<item>\s*<title>([^<]+)<\/title>\s*<link>([^<]+)<\/link>/i);
        if (match) {
          return {
            tag,
            title: match[1],
            description: '',
            url: match[2],
            source: 'rss',
          };
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  async fetchFromYouTube(tag) {
    try {
      const apiKey = process.env.YOUTUBE_API_KEY;
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(tag)}${apiKey ? `&key=${apiKey}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const item = data && data.items && data.items[0];
        if (item) {
          return {
            tag,
            title: item.snippet.title,
            description: item.snippet.description,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            source: 'youtube',
          };
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  async fetchFromArXiv(tag) {
    try {
      const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(tag)}&start=0&max_results=1`;
      const res = await fetch(url, { headers: { Accept: 'application/atom+xml' } });
      if (res.ok) {
        const text = await res.text();
        const match = text.match(/<entry>.*?<title>([^<]+)<\/title>.*?<id>([^<]+)<\/id>/s);
        if (match) {
          return {
            tag,
            title: match[1].trim(),
            description: '',
            url: match[2].trim(),
            source: 'arxiv',
          };
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  async fetchSuggestion(tag, type = 'text') {
    const strategies = [];
    if (type === 'video') {
      strategies.push(this.fetchFromYouTube);
    } else if (type === 'academic') {
      strategies.push(this.fetchFromArXiv);
    }
    strategies.push(this.fetchFromReddit);
    strategies.push(this.fetchFromRSS);
    strategies.push(this.fetchFromWikipedia);
    for (const fn of strategies) {
      const suggestion = await fn.call(this, tag);
      if (suggestion) {
        return suggestion;
      }
    }
    return { tag, title: tag, description: '', url: '', source: 'none' };
  }

  async getCardSuggestions(cardId, limit = 3) {
    if (!this.webSuggestionsEnabled) {
      return [];
    }
    const card = this.cards.get(cardId);
    if (!card) {
      return [];
    }
    const results = [];
    for (const tag of card.tags) {
      if (results.length >= limit) {
        break;
      }
      results.push(await this.fetchSuggestion(tag, card.type));
    }
    return results;
  }

  async getThemeSuggestions(limit = 3) {
    if (!this.webSuggestionsEnabled) {
      return [];
    }
    const counts = new Map();
    for (const card of this.cards.values()) {
      for (const tag of card.tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
    const results = [];
    for (const tag of sorted) {
      if (results.length >= limit) {
        break;
      }
      results.push(await this.fetchSuggestion(tag));
    }
    return results;
  }

  async getWebSuggestions(limit = 3) {
    // backward compatibility: alias to theme suggestions
    return this.getThemeSuggestions(limit);
  }

  removeCard(cardId) {
    const card = this.cards.get(cardId);
    if (!card) {
      return false;
    }
    for (const deckName of card.decks) {
      const deck = this.decks.get(deckName);
      if (deck) {
        deck.removeCard(card);
      }
    }
    // remove links involving this card
    for (const [id, link] of this.links) {
      if (link.from === cardId || link.to === cardId) {
        this.links.delete(id);
        this.emit('linkRemoved', link);
      }
    }
    this.cards.delete(cardId);
    this.emit('cardRemoved', card);
    if (this.db) {
      try {
        this.db.deleteCard(cardId);
      } catch (e) {
        this.emit('error', e);
      }
    }
    return true;
  }

  removeDeck(deckName) {
    const deck = this.decks.get(deckName);
    if (!deck) {
      return false;
    }
    for (const cardId of deck.cards) {
      const card = this.cards.get(cardId);
      if (card) {
        card.decks.delete(deckName);
      }
    }
    this.decks.delete(deckName);
    this.emit('deckRemoved', deckName);
    return true;
  }

  createLink(fromId, toId, type = 'related') {
    const from = this.cards.get(fromId);
    const to = this.cards.get(toId);
    if (!from || !to) {
      throw new Error('Both cards must exist to create a link');
    }
    const id = String(this.nextLinkId++);
    const link = new Link({ id, from: fromId, to: toId, type });
    this.links.set(id, link);
    this.emit('linkCreated', link);
    return link;
  }

  getLinks(cardId) {
    const results = [];
    for (const link of this.links.values()) {
      if (link.from === cardId || link.to === cardId) {
        results.push(link);
      }
    }
    return results;
  }

  removeLink(linkId) {
    const link = this.links.get(linkId);
    const res = this.links.delete(linkId);
    if (res && link) {
      this.emit('linkRemoved', link);
    }
    return res;
  }

  getGraph(options = {}) {
    let deckName = null;
    let tagFilter = null;
    let linkTypeFilter = null;
    if (typeof options === 'string') {
      deckName = options;
    } else {
      deckName = options.deck || null;
      tagFilter = options.tag || null;
      linkTypeFilter = options.linkType || null;
    }

    let cardIds;
    if (deckName) {
      const deck = this.decks.get(deckName);
      if (!deck) {
        return { nodes: [], edges: [] };
      }
      cardIds = new Set(deck.cards);
    } else {
      cardIds = new Set(this.cards.keys());
    }

    const nodes = [];
    for (const id of cardIds) {
      const card = this.cards.get(id);
      if (!card) {
        continue;
      }
      if (tagFilter && !card.tags.has(tagFilter)) {
        continue;
      }
      nodes.push({
        id: card.id,
        title: card.title,
        tags: Array.from(card.tags),
        decks: Array.from(card.decks),
      });
    }

    const includedIds = new Set(nodes.map(n => n.id));

    const edges = [];
    for (const link of this.links.values()) {
      if (linkTypeFilter && link.type !== linkTypeFilter) {
        continue;
      }
      if (includedIds.has(link.from) && includedIds.has(link.to)) {
        edges.push({ id: link.id, from: link.from, to: link.to, type: link.type });
      }
    }

    return { nodes, edges };
  }

  async processCard(card) {
    const tasks = [];
    if (!card.summary) {
      const text = card.content || card.source || card.title;
      tasks.push(this.summarize(text).then(s => { card.summary = s; }));
    }
    if (!card.illustration) {
      tasks.push(this.generateIllustration(card.title).then(i => { card.illustration = i; }));
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  }

  async summarize(text) {
    return this.ai.summarize(text);
  }

  async generateIllustration(title) {
    return this.ai.generateIllustration(title);
  }

  async chat(query) {
    if (!this.aiEnabled) {
      return 'AI disabled';
    }
    return this.ai.chat(query, this);
  }

  toJSON() {
    return {
      cards: Array.from(this.cards.values()).map(card => ({
        id: card.id,
        title: card.title,
        content: card.content,
        source: card.source,
        tags: Array.from(card.tags),
        decks: Array.from(card.decks),
        type: card.type,
        description: card.description,
        createdAt: card.createdAt,
        summary: card.summary,
        illustration: card.illustration,
      })),
      decks: Array.from(this.decks.values()).map(deck => ({
        name: deck.name,
        cards: Array.from(deck.cards),
      })),
      links: Array.from(this.links.values()).map(link => ({
        id: link.id,
        from: link.from,
        to: link.to,
        type: link.type,
      })),
    };
  }

  saveToFile(path) {
    fs.writeFileSync(path, JSON.stringify(this.toJSON(), null, 2));
  }

  static fromJSON(data) {
    const app = new MemoryApp();
    app.aiEnabled = false;
      for (const cardData of data.cards || []) {
      const card = new Card(cardData);
      app.cards.set(card.id, card);
      const num = Number(card.id);
      if (!Number.isNaN(num) && num >= app.nextId) {
        app.nextId = num + 1;
      }
    }
    for (const deckData of data.decks || []) {
      const deck = app.getDeck(deckData.name);
      for (const cardId of deckData.cards) {
        const card = app.cards.get(cardId);
        if (card) {
          deck.addCard(card);
        }
      }
    }
    for (const linkData of data.links || []) {
      // ensure cards exist before creating link
      if (app.cards.has(linkData.from) && app.cards.has(linkData.to)) {
        const link = new Link(linkData);
        app.links.set(link.id, link);
        const num = Number(link.id);
        if (!Number.isNaN(num) && num >= app.nextLinkId) {
          app.nextLinkId = num + 1;
        }
      }
    }
    return app;
  }

  static loadFromFile(path) {
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    return MemoryApp.fromJSON(data);
  }

  loadFromDB() {
    const stored = this.db.loadCards();
    for (const data of stored) {
      const card = new Card(data);
      this.cards.set(card.id, card);
      const num = Number(card.id);
      if (!Number.isNaN(num) && num >= this.nextId) {
        this.nextId = num + 1;
      }
      for (const deckName of card.decks) {
        const deck = this.getDeck(deckName);
        deck.cards.add(card.id);
      }
    }
  }
}

module.exports = MemoryApp;
