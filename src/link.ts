class Link {
  id: string;
  from: string;
  to: string;
  type: string;
  annotation: string;

  constructor({ id, from, to, type = 'related', annotation = '' }: any) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.type = String(type ?? 'related').trim().toLowerCase();
    this.annotation = annotation;
  }

  update({ type, annotation }: any) {
    if (type !== undefined) {
      this.type = String(type).trim().toLowerCase();
    }
    if (annotation !== undefined) {
      this.annotation = annotation;
    }
  }
}

export default Link;
