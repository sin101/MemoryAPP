class Deck {
  constructor(name) {
    this.name = name;
    this.cards = new Set();
  }

  addCard(card) {
    this.cards.add(card.id);
    card.addDeck(this.name);
  }

  removeCard(card) {
    this.cards.delete(card.id);
    card.decks.delete(this.name);
  }
}

module.exports = Deck;
