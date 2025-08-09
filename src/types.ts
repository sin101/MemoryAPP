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

export interface AppOptions {
  ai?: any;
  dbPath?: string;
  encryptionKey?: string;
  logPath?: string;
  backgroundProcessing?: boolean;
}

export interface AIResult {
  summary?: string;
  illustration?: string;
}
