class Card {
  constructor({
    id,
    title,
    content,
    tags = [],
    decks = [],
    type = 'text',
    description = '',
    createdAt = new Date().toISOString(),
  }) {
    this.id = id;
    this.title = title;
    this.content = content;
    this.tags = new Set(tags);
    this.decks = new Set(decks);
    this.type = type;
    this.description = description;
    this.createdAt = createdAt;
  }

  addTag(tag) {
    this.tags.add(tag);
  }

  addDeck(deckName) {
    this.decks.add(deckName);
  }

  removeTag(tag) {
    this.tags.delete(tag);
  }

  update({ title, content, tags, description, type }) {
    if (title !== undefined) {
      this.title = title;
    }
    if (content !== undefined) {
      this.content = content;
    }
    if (tags !== undefined) {
      this.tags = new Set(tags);
    }
    if (description !== undefined) {
      this.description = description;
    }
    if (type !== undefined) {
      this.type = type;
    }
  }
}

module.exports = Card;
