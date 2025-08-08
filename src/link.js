class Link {
  constructor({ id, from, to, type = 'related', annotation = '' }) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.type = type;
    this.annotation = annotation;
  }
}

module.exports = Link;
