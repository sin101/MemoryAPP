export interface CardData {
  id?: string;
  title?: string;
  content?: string;
  source?: string;
  tags?: string[];
  decks?: string[];
  type?: string;
  description?: string;
  createdAt?: string;
  summary?: string;
  illustration?: string;
  contentType?: string;
  duration?: number;
  embedding?: number[];
}

export interface AIProvider {
  summarize(text: string): Promise<string>;
  summarizeCard(card: import('./card.js').default): Promise<string>;
  generateIllustration(title: string): Promise<string>;
  chat(query: string, app: import('./app.js').default): Promise<string>;
  embed(text: string): Promise<number[]>;
  transcribe?(path: string): Promise<string>;
}

export interface AppOptions {
  ai?: AIProvider;
  dbPath?: string;
  encryptionKey?: string;
  logPath?: string;
  backgroundProcessing?: boolean;
}

export interface AIResult {
  summary?: string;
  illustration?: string;
}
