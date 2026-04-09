/**
 * contentAnalyzer.ts
 * Free, offline, zero-download content analysis.
 *
 * - RAKE keyword extraction (pure JS)
 * - Keyword-to-topic scoring for 15 topic categories
 * - Tag suggestion pipeline
 */

// ── Stopwords ──────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a','able','about','across','after','all','almost','also','am','among',
  'an','and','any','are','as','at','be','because','been','but','by','can',
  'cannot','could','dear','did','do','does','either','else','ever','every',
  'for','from','get','got','had','has','have','he','her','hers','him','his',
  'how','however','i','if','in','into','is','it','its','just','least','let',
  'like','likely','may','me','might','most','must','my','neither','no','nor',
  'not','of','off','often','on','only','or','other','our','own','rather',
  'said','say','says','she','should','since','so','some','than','that','the',
  'their','them','then','there','these','they','this','tis','to','too','twas',
  'us','wants','was','we','were','what','when','where','which','while','who',
  'whom','why','will','with','would','yet','you','your','has','have','been',
  'more','new','one','two','three','many','much','very','well','also','here',
  'get','use','used','using','via','per','each','such','both','up','out',
  'being','its','own','same','now','then','over','after','before','during',
  'about','above','below','between','through','while','because','although',
  'however','therefore','moreover','furthermore','meanwhile',
]);

// ── RAKE implementation ────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
}

function getCandidatePhrases(text: string): string[][] {
  const words = tokenize(text);
  const phrases: string[][] = [];
  let current: string[] = [];

  for (const word of words) {
    if (STOPWORDS.has(word) || /^\d+$/.test(word)) {
      if (current.length > 0) {
        phrases.push(current);
        current = [];
      }
    } else {
      current.push(word);
    }
  }
  if (current.length > 0) phrases.push(current);

  // Filter: keep 1–4 word phrases
  return phrases.filter(p => p.length >= 1 && p.length <= 4);
}

function scoreKeywords(phrases: string[][]): Map<string, number> {
  const freq = new Map<string, number>();
  const degree = new Map<string, number>();

  for (const phrase of phrases) {
    const d = phrase.length - 1;
    for (const word of phrase) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
      degree.set(word, (degree.get(word) ?? 0) + d);
    }
  }

  // word score = (freq + degree) / freq
  const wordScore = new Map<string, number>();
  for (const [word, f] of freq) {
    wordScore.set(word, (f + (degree.get(word) ?? 0)) / f);
  }

  // phrase score = sum of word scores
  const phraseScore = new Map<string, number>();
  for (const phrase of phrases) {
    const key = phrase.join(' ');
    const score = phrase.reduce((s, w) => s + (wordScore.get(w) ?? 0), 0);
    if (!phraseScore.has(key) || phraseScore.get(key)! < score) {
      phraseScore.set(key, score);
    }
  }

  return phraseScore;
}

export function extractKeywords(text: string, topN = 10): string[] {
  if (!text || text.length < 20) return [];
  const phrases = getCandidatePhrases(text.slice(0, 20_000));
  if (!phrases.length) return [];
  const scores = scoreKeywords(phrases);
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([kw]) => kw)
    .filter(kw => kw.length > 2);
}

// ── Topic classification ───────────────────────────────────────────────────

const TOPIC_KEYWORDS: Record<string, string[]> = {
  technology:    ['software','code','programming','developer','api','algorithm','database','cloud','server','framework','javascript','python','typescript','react','ai','machine learning','neural','gpu','cpu','github','open source','docker','kubernetes','web','app','mobile','startup','tech','computer','data','model','training'],
  science:       ['research','study','experiment','hypothesis','discovery','biology','chemistry','physics','astronomy','genetics','evolution','climate','quantum','molecule','cell','brain','neuroscience','lab','scientist','paper','journal','findings'],
  health:        ['health','medical','doctor','patient','disease','treatment','medicine','mental','therapy','fitness','nutrition','diet','exercise','hospital','symptom','diagnosis','drug','vaccine','wellness','sleep','stress'],
  finance:       ['market','stock','investment','economy','financial','money','bank','crypto','bitcoin','trading','fund','portfolio','revenue','profit','startup','venture','ipo','debt','inflation','recession','tax','budget'],
  entertainment: ['movie','film','music','show','series','game','netflix','spotify','youtube','celebrity','actor','director','album','concert','festival','entertainment','streaming','award','oscar','grammy'],
  sports:        ['sport','football','soccer','basketball','tennis','cricket','baseball','athlete','team','match','tournament','championship','league','olympic','player','coach','goal','score'],
  politics:      ['government','election','president','democracy','policy','law','vote','congress','senate','parliament','political','party','republican','democrat','rights','freedom','war','peace','nato','un'],
  education:     ['learn','course','university','school','student','teacher','education','tutorial','training','skill','degree','certificate','class','lecture','curriculum','study','knowledge'],
  food:          ['recipe','food','cooking','restaurant','chef','meal','ingredient','cuisine','diet','baking','vegan','vegetarian','nutrition','drink','coffee','wine','beer'],
  travel:        ['travel','trip','destination','hotel','flight','tourism','country','city','adventure','beach','mountain','passport','visa','backpack','culture'],
  design:        ['design','ux','ui','graphic','typography','color','layout','brand','logo','illustration','figma','sketch','css','animation','interface','aesthetic'],
  business:      ['business','company','strategy','management','leadership','marketing','sales','customer','product','launch','growth','enterprise','ceo','team','hr','agile','sprint'],
  gaming:        ['game','gaming','player','level','quest','rpg','fps','console','pc','steam','playstation','xbox','nintendo','esport','streamer','twitch'],
  music:         ['music','song','artist','band','album','genre','piano','guitar','lyrics','producer','record','beat','remix','playlist','jazz','rock','pop','hip-hop','classical'],
  film:          ['film','movie','cinema','director','actor','scene','plot','review','documentary','animation','script','production','box office','award','imdb'],
};

export function classifyTopic(text: string): string | null {
  const lower = text.toLowerCase().slice(0, 10_000);
  const scores: Record<string, number> = {};

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      // Count occurrences (multi-word phrases count more)
      const re = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'gi');
      const matches = lower.match(re);
      if (matches) score += matches.length * (kw.includes(' ') ? 2 : 1);
    }
    scores[topic] = score;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : null;
}

// ── Tag suggestion ─────────────────────────────────────────────────────────

function cleanTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

export interface AnalysisResult {
  suggestedTags: string[];
  topic: string | null;
  keywords: string[];
}

export function analyzeContent(
  text: string,
  type: string,
  existingTags: string[] = []
): AnalysisResult {
  if (!text || text.length < 10) {
    return { suggestedTags: [], topic: null, keywords: [] };
  }

  const keywords = extractKeywords(text, 12);
  const topic    = classifyTopic(text);

  // Build tag candidates
  const candidates = new Set<string>();

  // Add topic as first tag
  if (topic) candidates.add(topic);

  // Add content type as tag
  const typeTag: Record<string, string> = {
    youtube: 'video',
    tweet:   'social-media',
    article: 'article',
    link:    'link',
    audio:   'audio',
    text:    'note',
  };
  if (typeTag[type]) candidates.add(typeTag[type]);

  // Add top keywords (prefer multi-word for specificity)
  const sorted = [...keywords].sort((a, b) => {
    const aMulti = a.includes(' ') ? 1 : 0;
    const bMulti = b.includes(' ') ? 1 : 0;
    return bMulti - aMulti;
  });

  for (const kw of sorted) {
    const tag = cleanTag(kw);
    if (tag.length > 2) candidates.add(tag);
    if (candidates.size >= 10) break;
  }

  // Remove tags that already exist on the card
  const existingSet = new Set(existingTags.map(t => t.toLowerCase()));
  const suggestedTags = [...candidates]
    .filter(t => !existingSet.has(t))
    .slice(0, 6);

  return { suggestedTags, topic, keywords };
}
