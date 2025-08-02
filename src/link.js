class Link {
  constructor({ id, from, to, type = 'related' }) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.type = type;
  }
}

module.exports = Link;
