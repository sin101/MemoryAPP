const Card = require('./card');
const Deck = require('./deck');
const Link = require('./link');
const fs = require('fs');
const path = require('path');
const MemoryDB = require('./db');
const { SimpleAI, HuggingFaceAI, TransformersAI, hasLocalModels } = require('./ai');
const EventEmitter = require('events');
const { fetchSuggestion } = require('./suggestions');
const crypto = require('crypto');
const JSZip = require('jszip');
const Logger = require('./logger');

class MemoryApp extends EventEmitter {
  constructor(options = {}) {
    super();
    this.cards = new Map();
    this.decks = new Map();
    this.links = new Map();
    this.linksByCard = new Map();
    this.tagIndex = new Map();
    this.usageStats = new Map();
    this.nextId = 1;
    this.nextLinkId = 1;
    this.aiEnabled = true;
    this.webSuggestionsEnabled = true;
    this.externalCallsEnabled = true;
    this.backgroundProcessing = !!options.backgroundProcessing;
    if (options.ai) {
      this.ai = options.ai;
    } else if (hasLocalModels()) {
      this.ai = new TransformersAI();
    } else if (process.env.HUGGINGFACE_API_KEY) {
      this.ai = new HuggingFaceAI({ autoSelect: true });
    } else {
      this.ai = new SimpleAI();
    }
    this.db = options.dbPath ? new MemoryDB(options.dbPath) : null;
    if (this.db) {
      this.loadFromDB();
    }
    if (options.logPath) {
      this.logger = new Logger(options.logPath);
      this.on('error', err => this.logger.error(err.message));
      this.on('cardCreated', c => this.logger.info(`cardCreated:${c.id}`));
      process.on('uncaughtException', err => this.logger.error(`uncaught:${err.message}`));
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

  setExternalCallsEnabled(enabled) {
    this.externalCallsEnabled = enabled;
    this.aiEnabled = enabled;
    this.webSuggestionsEnabled = enabled;
  }

  enableLogging(path) {
    this.logger = new Logger(path);
    this.on('error', err => this.logger.error(err.message));
    this.on('cardCreated', c => this.logger.info(`cardCreated:${c.id}`));
    process.on('uncaughtException', err => this.logger.error(`uncaught:${err.message}`));
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
    delete card.embedding;
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

  async searchBySemantic(query, limit = 5) {
    if (!this.ai.embed) {
      return this.searchByText(query).slice(0, limit);
    }
    const qVec = await this.ai.embed(query);
    const scored = [];
    for (const card of this.cards.values()) {
      const basis = card.content || card.source || card.title || '';
      if (!basis) {
        continue;
      }
      if (!card.embedding) {
        card.embedding = await this.ai.embed(basis);
      }
      const sim = cosine(qVec, card.embedding);
      if (sim > 0) {
        scored.push({ card, sim });
      }
    }
    scored.sort((a, b) => b.sim - a.sim);
    return scored.slice(0, limit).map(s => s.card);

    function cosine(a, b) {
      let dot = 0, na = 0, nb = 0;
      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      return na && nb ? dot / Math.sqrt(na * nb) : 0;
    }
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
      pending.push(fetchSuggestion(tag, card.type));
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
      pending.push(fetchSuggestion(tag));
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
    if (!card.summary) {
      tasks.push(this.summarizeCard(card).then(s => { card.summary = s; }));
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

  async saveEncryptedToFile(path, password) {
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update(password).digest();
    const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
    const json = Buffer.from(JSON.stringify(this.toJSON()));
    const encrypted = Buffer.concat([iv, cipher.update(json), cipher.final()]);
    await fs.promises.writeFile(path, encrypted);
  }

  async saveMedia(buffer, filename) {
    const dir = 'storage';
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  async exportZip(zipPath) {
    const zip = new JSZip();
    zip.file('data.json', JSON.stringify(this.toJSON(), null, 2));
    const dir = 'storage';
    if (fs.existsSync(dir)) {
      const files = await fs.promises.readdir(dir);
      for (const f of files) {
        const content = await fs.promises.readFile(path.join(dir, f));
        zip.file(`media/${f}`, content);
      }
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    await fs.promises.writeFile(zipPath, buffer);
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

  static async loadEncryptedFromFile(path, password) {
    const data = await fs.promises.readFile(path);
    const iv = data.slice(0, 16);
    const encrypted = data.slice(16);
    const key = crypto.createHash('sha256').update(password).digest();
    const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
    return MemoryApp.fromJSON(JSON.parse(json));
  }

  static async importZip(zipPath) {
    const data = await fs.promises.readFile(zipPath);
    const zip = await JSZip.loadAsync(data);
    const json = JSON.parse(await zip.file('data.json').async('string'));
    const app = MemoryApp.fromJSON(json);
    const dir = 'storage';
    await fs.promises.mkdir(dir, { recursive: true });
    const media = Object.keys(zip.files).filter(n => n.startsWith('media/') && !zip.files[n].dir);
    for (const name of media) {
      const content = await zip.file(name).async('nodebuffer');
      const fname = name.replace('media/', '');
      await fs.promises.writeFile(path.join(dir, fname), content);
    }
    return app;
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
