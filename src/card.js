class Card {
  constructor({
    id,
    title,
    content,
    source = '',
    tags = [],
    decks = [],
    type = 'text',
    description = '',
    createdAt = new Date().toISOString(),
    summary = '',
    illustration = '',
    contentType = '',
    duration = 0,
  }) {
    this.id = id;
    this.title = title;
    this.content = content;
    this.source = source;
    this.tags = new Set(tags);
    this.decks = new Set(decks);
    this.type = type;
    this.description = description;
    this.createdAt = createdAt;
    this.summary = summary;
    this.illustration = illustration;
    this.contentType = contentType;
    this.duration = duration;
    this._updateSearchText();
  }

  addTag(tag) {
    this.tags.add(tag.toLowerCase());
  }

  addDeck(deckName) {
    this.decks.add(deckName);
  }

  removeTag(tag) {
    this.tags.delete(tag);
  }

  update({ title, content, source, tags, description, type, summary, illustration, contentType, duration }) {
    if (title !== undefined) {
      this.title = title;
    }
    if (content !== undefined) {
      this.content = content;
    }
    if (source !== undefined) {
      this.source = source;
    }
    if (tags !== undefined) {
      this.tags = new Set(tags.map(tag => tag.toLowerCase()));
    }
    if (description !== undefined) {
      this.description = description;
    }
    if (type !== undefined) {
      this.type = type;
    }
    if (summary !== undefined) {
      this.summary = summary;
    }
    if (illustration !== undefined) {
      this.illustration = illustration;
    }
    if (contentType !== undefined) {
      this.contentType = contentType;
    }
    if (duration !== undefined) {
      this.duration = duration;
    }
    this._updateSearchText();
  }

  _updateSearchText() {
    const parts = [this.title, this.content, this.description]
      .filter(Boolean)
      .map(s => s.toLowerCase());
    this.searchText = parts.join(' ');
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      content: this.content,
      source: this.source,
      tags: Array.from(this.tags),
      decks: Array.from(this.decks),
      type: this.type,
      description: this.description,
      createdAt: this.createdAt,
      summary: this.summary,
      illustration: this.illustration,
      contentType: this.contentType,
      duration: this.duration,
    };
  }
}

module.exports = Card;
