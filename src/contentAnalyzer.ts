/**
 * contentAnalyzer.ts
 * Content analysis: tag extraction and summarization.
 *
 * Summarization: TextRank (extractive, fully offline)
 * Tags: TF-IDF-weighted RAKE (offline) — Pollinations called browser-side in QuickAdd
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
  'however','therefore','moreover','furthermore','meanwhile','said','say',
  'says','make','makes','made','take','takes','took','come','goes','went',
  'just','even','still','back','way','day','time','year','years','people',
  'look','looks','looking','know','thinks','think','thought','need','needs',
  'want','wanted','wants','good','great','best','first','last','next','right',
  'long','little','large','small','big','old','new','high','low','different',
  'following','important','including','based','used','given','set','number',
]);

// ── TextRank Summarization ─────────────────────────────────────────────────

function sentenceWords(s: string): Set<string> {
  return new Set(
    (s.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []).filter(w => !STOPWORDS.has(w))
  );
}

function jaccardSim(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

export function extractiveSummarize(text: string, numSentences = 3): string {
  const raw = text
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Split into sentences with basic heuristics
  const sentences = raw
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map(s => s.trim())
    .filter(s => {
      const wc = s.split(/\s+/).length;
      return wc >= 5 && wc <= 100 && s.length <= 600;
    });

  if (sentences.length === 0) return raw.slice(0, 300);
  if (sentences.length <= numSentences) return sentences.join(' ');

  // Cap at 60 sentences for O(n²) cost
  const capped = sentences.slice(0, 60);
  const n = capped.length;
  const wordSets = capped.map(sentenceWords);

  // Build similarity matrix
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = jaccardSim(wordSets[i], wordSets[j]);
      sim[i][j] = sim[j][i] = s;
    }
  }

  // PageRank (20 iterations)
  const d = 0.85;
  let scores = new Array(n).fill(1 / n);
  for (let iter = 0; iter < 20; iter++) {
    const next = new Array(n).fill((1 - d) / n);
    for (let i = 0; i < n; i++) {
      const outSum = sim[i].reduce((s, v) => s + v, 0) || 1;
      for (let j = 0; j < n; j++) {
        next[j] += d * (sim[i][j] / outSum) * scores[i];
      }
    }
    scores = next;
  }

  // Select top sentences in original order
  const ranked = scores
    .map((score, idx) => ({ idx, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, numSentences)
    .map(x => x.idx)
    .sort((a, b) => a - b);

  return ranked.map(i => capped[i]).join(' ');
}

// ── TF-IDF-weighted keyword extraction ────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

function getCandidatePhrases(text: string): string[][] {
  const phrases: string[][] = [];

  // Process sentence by sentence to prevent cross-sentence bigrams
  const sentencePattern = /[^.!?]+[.!?]+/g;
  const sentences = text.match(sentencePattern) ?? [text];

  for (const sentence of sentences) {
    const words = sentence.toLowerCase().split(/[\s,;:()\[\]{}"']+/).filter(w => w.length > 0);
    let current: string[] = [];

    for (const word of words) {
      const clean = word.replace(/^[-']+|[-'.]+$/g, '');
      if (!clean || STOPWORDS.has(clean) || /^\d+$/.test(clean) || clean.length <= 2) {
        if (current.length > 0) { phrases.push(current); current = []; }
      } else {
        current.push(clean);
      }
    }
    if (current.length > 0) phrases.push(current);
  }

  // Keep 1–2 word phrases only
  return phrases.filter(p => p.length >= 1 && p.length <= 2);
}

export function extractKeywords(text: string, topN = 10): string[] {
  if (!text || text.length < 20) return [];

  const words = tokenize(text.slice(0, 30_000));
  if (!words.length) return [];

  // Term frequency
  const tf = new Map<string, number>();
  for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);

  // Score: TF with diminishing returns (log), boosted by phrase co-occurrence
  const phrases = getCandidatePhrases(text.slice(0, 30_000));
  const phraseBoost = new Map<string, number>();
  for (const p of phrases) {
    if (p.length === 2) {
      const key = p.join(' ');
      phraseBoost.set(key, (phraseBoost.get(key) ?? 0) + 1);
    }
  }

  // Score single terms by TF (log-scaled, prefer 2–8 occurrences)
  const termScores = new Map<string, number>();
  for (const [term, freq] of tf) {
    if (term.length <= 2) continue;
    // Log-TF: peaks around 3–6 occurrences
    const score = Math.log(1 + freq) * (freq <= 10 ? 1 : 0.5);
    termScores.set(term, score);
  }

  // Add 2-word phrase scores
  const results: Array<{ kw: string; score: number }> = [];

  for (const [phrase, count] of phraseBoost) {
    if (count < 1) continue;
    const [a, b] = phrase.split(' ');
    const baseScore = ((termScores.get(a) ?? 0) + (termScores.get(b) ?? 0)) * (1 + Math.log(1 + count));
    results.push({ kw: phrase, score: baseScore });
  }

  for (const [term, score] of termScores) {
    results.push({ kw: term, score });
  }

  // Deduplicate: if a phrase contains a single word, prefer the phrase
  const phraseSet = new Set(results.filter(r => r.kw.includes(' ')).map(r => r.kw));
  const filtered = results.filter(r => {
    if (!r.kw.includes(' ')) {
      // Remove single word if it's already covered by a phrase
      return ![...phraseSet].some(p => p.split(' ').includes(r.kw) && p.split(' ').length > 1);
    }
    return true;
  });

  // Heuristic: filter out phrases that start with common adjective/adverb patterns
  // These make poor tags (e.g. "incredibly-rich", "remain-liquid")
  const ADJ_ADVERB_SUFFIXES = /^(incredibly|extremely|highly|very|quite|really|truly|deeply|fully|easily|quickly|slowly|carefully|remain|serve|build|process|generate)\b/;
  const isGoodTag = (kw: string): boolean => {
    const first = kw.split(' ')[0];
    if (ADJ_ADVERB_SUFFIXES.test(first)) return false;
    // Reject if first word ends in typical adverb/adj suffixes
    if (/ly$/.test(first) && first.length > 5) return false;
    return kw.length > 2;
  };

  return filtered
    .sort((a, b) => b.score - a.score)
    .slice(0, topN * 3)
    .map(x => x.kw)
    .filter(isGoodTag)
    .slice(0, topN);
}

// ── Topic classification ───────────────────────────────────────────────────

const TOPIC_KEYWORDS: Record<string, string[]> = {
  technology:    ['software','code','programming','developer','api','algorithm','database','cloud','server','framework','javascript','python','typescript','react','ai','machine learning','neural','gpu','cpu','github','open source','docker','kubernetes','web app','mobile','startup','tech','computer','data','model','training','llm','deep learning'],
  science:       ['research','study','experiment','hypothesis','discovery','biology','chemistry','physics','astronomy','genetics','evolution','climate','quantum','molecule','cell','brain','neuroscience','lab','scientist','paper','journal','findings'],
  health:        ['health','medical','doctor','patient','disease','treatment','medicine','mental health','therapy','fitness','nutrition','diet','exercise','hospital','symptom','diagnosis','drug','vaccine','wellness','sleep','stress'],
  finance:       ['market','stock','investment','economy','financial','money','bank','crypto','bitcoin','trading','fund','portfolio','revenue','profit','venture capital','ipo','debt','inflation','recession','tax','budget'],
  entertainment: ['movie','film','music','show','series','game','netflix','spotify','youtube','celebrity','actor','director','album','concert','festival','streaming','award','oscar','grammy'],
  sports:        ['sport','football','soccer','basketball','tennis','cricket','baseball','athlete','team','match','tournament','championship','league','olympic','player','coach','goal','score'],
  politics:      ['government','election','president','democracy','policy','law','vote','congress','senate','parliament','political party','republican','democrat','rights','freedom','war','peace','nato'],
  education:     ['learn','course','university','school','student','teacher','education','tutorial','training','skill','degree','certificate','class','lecture','curriculum','study','knowledge'],
  food:          ['recipe','food','cooking','restaurant','chef','meal','ingredient','cuisine','diet','baking','vegan','vegetarian','nutrition','drink','coffee','wine','beer'],
  travel:        ['travel','trip','destination','hotel','flight','tourism','country','city','adventure','beach','mountain','passport','visa','backpack','culture'],
  design:        ['design','ux','ui','graphic','typography','color','layout','brand','logo','illustration','figma','sketch','css','animation','interface','aesthetic'],
  business:      ['business','company','strategy','management','leadership','marketing','sales','customer','product','launch','growth','enterprise','ceo','team','agile','sprint'],
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
      const re = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'gi');
      const matches = lower.match(re);
      if (matches) score += matches.length * (kw.includes(' ') ? 2.5 : 1);
    }
    scores[topic] = score;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 3 ? best[0] : null;
}

// ── Tag cleaning ───────────────────────────────────────────────────────────

function cleanTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

// ── Analysis result ────────────────────────────────────────────────────────

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

  const keywords = extractKeywords(text, 30);
  const topic    = classifyTopic(text);

  const candidates = new Set<string>();

  if (topic) candidates.add(topic);

  for (const kw of keywords) {
    const tag = cleanTag(kw);
    if (tag.length > 2 && tag.length <= 28) candidates.add(tag);
    if (candidates.size >= 30) break;
  }

  const existingSet = new Set(existingTags.map(t => t.toLowerCase()));
  const suggestedTags = [...candidates].filter(t => !existingSet.has(t)).slice(0, 25);

  return { suggestedTags, topic, keywords };
}

// async alias — same implementation (Pollinations called browser-side in QuickAdd)
export async function analyzeContentAsync(
  text: string,
  type: string,
  existingTags: string[] = []
): Promise<AnalysisResult> {
  return analyzeContent(text, type, existingTags);
}
