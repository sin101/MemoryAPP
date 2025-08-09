class Card {
  id: string;
  title: string;
  content?: string;
  source: string;
  tags: Set<string>;
  decks: Set<string>;
  type: string;
  description: string;
  createdAt: string;
  summary: string;
  illustration: string;
  contentType: string;
  duration: number;
  embedding?: number[];
  searchText: string = '';

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
    embedding,
  }: any) {
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
    this.embedding = embedding;
    this._updateSearchText();
  }

  addTag(tag: string) {
    this.tags.add(tag.toLowerCase());
  }

  addDeck(deckName: string) {
    this.decks.add(deckName.toLowerCase());
  }

  removeTag(tag: string) {
    this.tags.delete(tag);
  }

  update({ title, content, source, tags, description, type, summary, illustration, contentType, duration, embedding }: any) {
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
      this.tags = new Set(tags.map((tag: string) => tag.toLowerCase()));
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
    if (embedding !== undefined) {
      this.embedding = embedding;
    }
    this._updateSearchText();
  }

  _updateSearchText() {
    const parts = [this.title, this.content, this.description]
      .filter(Boolean)
      .map((s: string | undefined) => (s || '').toLowerCase());
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
      embedding: this.embedding,
    };
  }
}

export default Card;
