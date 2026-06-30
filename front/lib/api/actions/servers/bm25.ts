// Minimal BM25 ranker used to verify that MCP tool descriptions are retrievable
// by a lexical tool-search index scoring name + description + input schema.
//
// Tokenizer: lowercase, split on non-alphanumeric, crude singularization
// (strip trailing "s" on tokens > 3 chars). Product names such as OneDrive /
// SharePoint / PowerPoint are kept whole; singularization approximates stemming
// so doc~docs, file~files, sheet~sheets match. Same tokenizer on query + docs.

import type { JSONSchema7, JSONSchema7Definition } from "json-schema";

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

// ---------------------------------------------------------------------------
// Corpus builder — mirrors what a tool-search index actually sees.
// Each tool becomes one document: name + description + every description /
// property key / enum value found in its input schema.
// ---------------------------------------------------------------------------

export interface ServerEntry {
  name: string;
  tools: ReadonlyArray<{
    name: string;
    description: string;
    inputSchema: JSONSchema7;
  }>;
}

function collectSchemaText(def: JSONSchema7Definition | undefined): string[] {
  if (def === undefined || typeof def === "boolean") {
    return [];
  }

  const parts: string[] = [];

  if (typeof def.description === "string") {
    parts.push(def.description);
  }
  if (def.enum) {
    parts.push(
      def.enum.filter((e): e is string => typeof e === "string").join(" ")
    );
  }
  if (def.properties) {
    for (const [key, child] of Object.entries(def.properties)) {
      parts.push(key);
      parts.push(...collectSchemaText(child));
    }
  }
  if (def.items) {
    const items = Array.isArray(def.items) ? def.items : [def.items];
    for (const item of items) {
      parts.push(...collectSchemaText(item));
    }
  }
  for (const branch of [def.anyOf, def.oneOf, def.allOf]) {
    if (branch) {
      for (const sub of branch) {
        parts.push(...collectSchemaText(sub));
      }
    }
  }

  return parts;
}

export function buildDocs(servers: ServerEntry[]): Document[] {
  const docs: Document[] = [];
  for (const server of servers) {
    for (const tool of server.tools) {
      const parts = [
        tool.name,
        tool.description,
        ...collectSchemaText(tool.inputSchema),
      ];
      docs.push({
        name: `${server.name}.${tool.name}`,
        text: parts.join(" "),
      });
    }
  }
  return docs;
}
