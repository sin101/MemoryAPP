const Card = require('./card');
const Deck = require('./deck');
const Link = require('./link');
const fs = require('fs');
const MemoryDB = require('./db');
const { SimpleAI, HuggingFaceAI } = require('./ai');
const EventEmitter = require('events');
const { fetchSuggestion } = require('./suggestions');

class MemoryApp extends EventEmitter {
  constructor(options = {}) {
    super();
    this.cards = new Map();
    this.decks = new Map();
    this.links = new Map();
    this.linksByCard = new Map();
    this.tagIndex = new Map();
    this.usageStats = new Map();
    this.tagEmbeddings = new Map();
    this.suggestionThreshold =
      options.suggestionThreshold !== undefined
        ? options.suggestionThreshold
        : 0.2;
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
    if (this.cards.has(data.id)) {
      throw new Error('Card ID already exists');
    }
    const card = new Card(data);
    this.cards.set(card.id, card);
    this.emit('cardCreated', card);
    await this._processAndPersistCard(card);
    this._updateTagIndex(card);
    return card;
  }

  setAIEnabled(enabled) {
    this.aiEnabled = enabled;
  }

  setWebSuggestionsEnabled(enabled) {
    this.webSuggestionsEnabled = enabled;
  }

  setSuggestionThreshold(value) {
    this.suggestionThreshold = value;
  }

  async getTagVector(tag) {
    const key = tag.toLowerCase();
    if (this.tagEmbeddings.has(key)) {
      return this.tagEmbeddings.get(key);
    }
    if (!this.ai.embed) {
      return null;
    }
    const vec = await this.ai.embed(key);
    this.tagEmbeddings.set(key, vec);
    return vec;
    }

  async getCardEmbeddingsForTag(tag) {
    const cards = this.searchByTag(tag);
    const vectors = [];
    for (const card of cards) {
      if (this.ai.embed && !card.embedding) {
        try {
          card.embedding = await this.ai.embed(
            card.content || card.source || card.title || ''
          );
        } catch {
          /* ignore */
        }
      }
      if (card.embedding) {
        vectors.push(card.embedding);
      }
    }
    return vectors;
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
        card.addTag(w.toLowerCase());
      }
    }
    if (basis && !card.description) {
      card.description = basis.slice(0, 100);
    }
    card._updateSearchText();
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

  async createAudioNote(sourcePath, options = {}) {
    const transcript = await this.ai.transcribe(sourcePath);
    const data = Object.assign({}, options, {
      content: transcript,
      source: sourcePath,
      type: 'audio'
    });
    return this.createCard(data);
  }

  async updateCard(cardId, data) {
    const card = this.cards.get(cardId);
    if (!card) {
      return null;
    }
    const oldTags = new Set(card.tags);
    card.update(data);
    this.emit('cardUpdated', card);
    await this._processAndPersistCard(card);
    this._updateTagIndex(card, oldTags);
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
        try {
          await this.processCard(card);
          this.emit('cardProcessed', card);
        } catch (err) {
          this.emit('error', err);
        }
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
    const t = tag.toLowerCase();
    const ids = this.tagIndex.get(t);
    if (!ids) {
      return [];
    }
    const results = [];
    for (const id of ids) {
      const card = this.cards.get(id);
      if (card) {
        results.push(card);
      }
    }
    return results;
  }

  searchByText(query) {
    const q = query.toLowerCase();
    const results = [];
    for (const card of this.cards.values()) {
      if (card.searchText.includes(q)) {
        results.push(card);
      }
    }
    return results;
  }

  recordCardUsage(cardId) {
    const count = (this.usageStats.get(cardId) || 0) + 1;
    this.usageStats.set(cardId, count);
    this._updateFavoriteDeck();
  }

  _updateFavoriteDeck() {
    const deck = this.getDeck('favorites');
    deck.cards.clear();
    const top = Array.from(this.usageStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    for (const [id] of top) {
      const card = this.cards.get(id);
      if (card) {
        deck.addCard(card);
      }
    }
  }

  _addToTagIndex(card) {
    for (const tag of card.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag).add(card.id);
    }
  }

  _removeFromTagIndex(card) {
    for (const tag of card.tags) {
      const set = this.tagIndex.get(tag);
      if (set) {
        set.delete(card.id);
        if (set.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }

  _updateTagIndex(card, oldTags = new Set()) {
    for (const tag of oldTags) {
      if (!card.tags.has(tag)) {
        const set = this.tagIndex.get(tag);
        if (set) {
          set.delete(card.id);
          if (set.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      }
    }
    this._addToTagIndex(card);
  }

  async getCardSuggestions(cardId, limit = 3) {
    if (!this.webSuggestionsEnabled) {
      return [];
    }
    const card = this.cards.get(cardId);
    if (!card) {
      return [];
    }
    const pending = [];
    for (const tag of card.tags) {
      if (pending.length >= limit) {
        break;
      }
      pending.push(
        fetchSuggestion(tag, card.type, this, this.suggestionThreshold)
      );
    }
    const results = await Promise.all(pending);
    return results.filter(r => r);
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
    const pending = [];
    for (const tag of sorted) {
      if (pending.length >= limit) {
        break;
      }
      pending.push(fetchSuggestion(tag, 'text', this, this.suggestionThreshold));
    }
    const results = await Promise.all(pending);
    return results.filter(r => r);
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
    const deckNames = Array.from(card.decks);
    for (const deckName of deckNames) {
      const deck = this.decks.get(deckName);
      if (deck) {
        deck.removeCard(card);
      }
    }
    // remove links involving this card
    const linkIds = this.linksByCard.get(cardId);
    if (linkIds) {
      for (const id of Array.from(linkIds)) {
        this.removeLink(id);
      }
    }
    this.cards.delete(cardId);
    this._removeFromTagIndex(card);
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

  _indexLink(link) {
    if (!this.linksByCard.has(link.from)) {
      this.linksByCard.set(link.from, new Set());
    }
    this.linksByCard.get(link.from).add(link.id);
    if (!this.linksByCard.has(link.to)) {
      this.linksByCard.set(link.to, new Set());
    }
    this.linksByCard.get(link.to).add(link.id);
  }

  _unindexLink(link) {
    const fromSet = this.linksByCard.get(link.from);
    if (fromSet) {
      fromSet.delete(link.id);
      if (fromSet.size === 0) {
        this.linksByCard.delete(link.from);
      }
    }
    const toSet = this.linksByCard.get(link.to);
    if (toSet) {
      toSet.delete(link.id);
      if (toSet.size === 0) {
        this.linksByCard.delete(link.to);
      }
    }
  }

  createLink(fromId, toId, type = 'related', annotation = '') {
    const from = this.cards.get(fromId);
    const to = this.cards.get(toId);
    if (!from || !to) {
      throw new Error('Both cards must exist to create a link');
    }
    const id = String(this.nextLinkId++);
    const link = new Link({ id, from: fromId, to: toId, type, annotation });
    this.links.set(id, link);
    this._indexLink(link);
    this.emit('linkCreated', link);
    return link;
  }

  getLinks(cardId) {
    const ids = this.linksByCard.get(cardId);
    if (!ids) {
      return [];
    }
    const results = [];
    for (const id of ids) {
      const link = this.links.get(id);
      if (link) {
        results.push(link);
      }
    }
    return results;
  }

  getLinkedCardIds(cardId) {
    const ids = this.linksByCard.get(cardId);
    if (!ids) {
      return [];
    }
    const result = new Set();
    for (const id of ids) {
      const link = this.links.get(id);
      if (link) {
        result.add(link.from === cardId ? link.to : link.from);
      }
    }
    return Array.from(result);
  }

  removeLink(linkId) {
    const link = this.links.get(linkId);
    const res = this.links.delete(linkId);
    if (res && link) {
      this._unindexLink(link);
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
    const seen = new Set();
    for (const id of includedIds) {
      const linkIds = this.linksByCard.get(id);
      if (!linkIds) {
        continue;
      }
      for (const linkId of linkIds) {
        if (seen.has(linkId)) {
          continue;
        }
        const link = this.links.get(linkId);
        if (!link) {
          continue;
        }
        seen.add(linkId);
        if (linkTypeFilter && link.type !== linkTypeFilter) {
          continue;
        }
        if (includedIds.has(link.from) && includedIds.has(link.to)) {
          edges.push({ id: link.id, from: link.from, to: link.to, type: link.type });
        }
      }
    }

    return { nodes, edges };
  }

  async processCard(card) {
    const tasks = [];
    if (this.ai.embed) {
      const basis = card.content || card.source || card.title || '';
      tasks.push(
        this.ai.embed(basis).then(v => {
          card.embedding = v;
        })
      );
    }
    if (!card.summary) {
      tasks.push(this.summarizeCard(card).then(s => { card.summary = s; }));
    }
    if (!card.illustration) {
      tasks.push(
        this.generateIllustration(card.title).then(i => {
          card.illustration = i;
        })
      );
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  }

  async summarize(text) {
    return this.ai.summarize(text);
  }

  async summarizeCard(card) {
    if (this.ai.summarizeCard) {
      return this.ai.summarizeCard(card);
    }
    const text = card.content || card.source || card.title;
    return this.summarize(text);
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
        embedding: card.embedding,
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

  async saveToFile(path) {
    await fs.promises.writeFile(path, JSON.stringify(this.toJSON(), null, 2));
  }

  static fromJSON(data) {
    const app = new MemoryApp();
    app.aiEnabled = false;
    for (const cardData of data.cards || []) {
      if (cardData.tags) {
        cardData.tags = cardData.tags.map(t => t.toLowerCase());
      }
      const card = new Card(cardData);
      app.cards.set(card.id, card);
      app._addToTagIndex(card);
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
        app._indexLink(link);
        const num = Number(link.id);
        if (!Number.isNaN(num) && num >= app.nextLinkId) {
          app.nextLinkId = num + 1;
        }
      }
    }
    return app;
  }

  static async loadFromFile(path) {
    const data = JSON.parse(await fs.promises.readFile(path, 'utf8'));
    return MemoryApp.fromJSON(data);
  }

  loadFromDB() {
    const stored = this.db.loadCards();
    for (const data of stored) {
      data.tags = data.tags.map(t => t.toLowerCase());
      const card = new Card(data);
      this.cards.set(card.id, card);
      this._addToTagIndex(card);
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
