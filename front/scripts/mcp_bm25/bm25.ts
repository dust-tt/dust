// Minimal BM25 ranker used to sanity-check that MCP tool descriptions are
// retrievable by a lexical (BM25) tool-search index, which scores a query
// against each tool's name, description, and input schema.
//
// Tokenizer: lowercase, split on non-alphanumeric, then a crude
// singularization (strip one trailing "s" on tokens longer than 3 chars).
// Product names such as OneDrive / SharePoint / PowerPoint are intentionally
// kept whole so they match how users type them, and singularization
// approximates stemming so doc~docs, file~files, sheet~sheets match. The same
// tokenizer is applied to both the query and the documents.

const K1 = 1.2;
const B = 0.75;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

export interface Bm25Index {
  tokenized: string[][];
  avgdl: number;
  idf: Map<string, number>;
  names: string[];
}

export interface Document {
  name: string;
  text: string;
}

export function buildIndex(docs: Document[]): Bm25Index {
  const tokenized = docs.map((d) => tokenize(d.text));
  const n = docs.length;
  const avgdl = tokenized.reduce((sum, t) => sum + t.length, 0) / n;

  const df = new Map<string, number>();
  for (const toks of tokenized) {
    for (const t of new Set(toks)) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [t, count] of df) {
    idf.set(t, Math.log(1 + (n - count + 0.5) / (count + 0.5)));
  }

  return { tokenized, avgdl, idf, names: docs.map((d) => d.name) };
}

function scoreDocument(
  queryTokens: string[],
  docTokens: string[],
  idx: Bm25Index
): number {
  const tf = new Map<string, number>();
  for (const t of docTokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }

  const dl = docTokens.length;
  let score = 0;
  for (const q of queryTokens) {
    const f = tf.get(q);
    if (!f) {
      continue;
    }
    const idf = idx.idf.get(q) ?? 0;
    score += (idf * (f * (K1 + 1))) / (f + K1 * (1 - B + B * (dl / idx.avgdl)));
  }
  return score;
}

export interface RankedDocument {
  name: string;
  score: number;
}

export function rank(query: string, idx: Bm25Index): RankedDocument[] {
  const queryTokens = tokenize(query);
  return idx.names
    .map((name, i) => ({
      name,
      score: scoreDocument(queryTokens, idx.tokenized[i], idx),
    }))
    .sort((a, b) => b.score - a.score);
}
