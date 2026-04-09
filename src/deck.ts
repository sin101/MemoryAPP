class Deck {
  name: string;
  cards: Set<string>;

  constructor(name: string) {
    this.name = name.toLowerCase();
    this.cards = new Set();
  }

  addCard(card: import('./card.js').default) {
    this.cards.add(card.id);
    card.addDeck(this.name);
  }

  removeCard(card: import('./card.js').default) {
    this.cards.delete(card.id);
    card.decks.delete(this.name);
  }
}

export default Deck;
