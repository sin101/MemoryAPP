const Card = require('./card');
const Deck = require('./deck');
const Link = require('./link');
const fs = require('fs');

class MemoryApp {
  constructor() {
    this.cards = new Map();
    this.decks = new Map();
    this.links = new Map();
    this.nextId = 1;
    this.aiEnabled = true;
    this.webSuggestionsEnabled = true;
  }

  createCard(data) {
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
    if (this.aiEnabled) {
      this.enrichCard(card.id);
    }
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
    if (card.content && card.tags.size === 0) {
      const words = Array.from(
        new Set(card.content.toLowerCase().split(/\W+/).filter(w => w.length > 3))
      );
      for (const w of words.slice(0, 3)) {
        card.addTag(w);
      }
    }
    if (card.content && !card.description) {
      card.description = card.content.slice(0, 100);
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
  }

  updateCard(cardId, data) {
    const card = this.cards.get(cardId);
    if (!card) {
      return null;
    }
    card.update(data);
    if (this.aiEnabled) {
      this.enrichCard(cardId);
    }
    return card;
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
      const title = card.title.toLowerCase();
      const content = card.content.toLowerCase();
      const description = (card.description || '').toLowerCase();
      if (title.includes(q) || content.includes(q) || description.includes(q)) {
        results.push(card);
      }
    }
    return results;
  }

  async getWebSuggestions(limit = 3) {
    if (!this.webSuggestionsEnabled) {
      return [];
    }
    const tags = new Set();
    for (const card of this.cards.values()) {
      for (const tag of card.tags) {
        tags.add(tag);
      }
    }
    const results = [];
    for (const tag of tags) {
      if (results.length >= limit) {
        break;
      }
      let suggestion;
      try {
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(tag)}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          suggestion = {
            tag,
            title: data.title,
            description: data.extract,
            url: (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) || `https://en.wikipedia.org/wiki/${encodeURIComponent(tag)}`,
          };
        }
      } catch (e) {
        // ignore network errors and fall back to placeholder
      }
      if (!suggestion) {
        suggestion = {
          tag,
          title: tag,
          description: '',
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(tag)}`,
        };
      }
      results.push(suggestion);
    }
    return results;
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
      }
    }
    this.cards.delete(cardId);
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
    return true;
  }

  createLink(fromId, toId, type = 'related') {
    const from = this.cards.get(fromId);
    const to = this.cards.get(toId);
    if (!from || !to) {
      throw new Error('Both cards must exist to create a link');
    }
    const id = String(this.links.size + 1);
    const link = new Link({ id, from: fromId, to: toId, type });
    this.links.set(id, link);
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
    return this.links.delete(linkId);
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

  toJSON() {
    return {
      cards: Array.from(this.cards.values()).map(card => ({
        id: card.id,
        title: card.title,
        content: card.content,
        tags: Array.from(card.tags),
        decks: Array.from(card.decks),
        type: card.type,
        description: card.description,
        createdAt: card.createdAt,
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
    for (const cardData of data.cards || []) {
      app.createCard(cardData);
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
      }
    }
    return app;
  }

  static loadFromFile(path) {
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    return MemoryApp.fromJSON(data);
  }
}

module.exports = MemoryApp;
