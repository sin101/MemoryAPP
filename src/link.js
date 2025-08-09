class Link {
  constructor({ id, from, to, type = 'related', annotation = '' }) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.type = type.toLowerCase();
    this.annotation = annotation;
  }

  update({ type, annotation }) {
    if (type !== undefined) {
      this.type = type;
    }
    if (annotation !== undefined) {
      this.annotation = annotation;
    }
  }
}

module.exports = Link;
