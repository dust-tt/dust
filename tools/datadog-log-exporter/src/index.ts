#!/usr/bin/env node
import { setTimeout as sleep } from "node:timers/promises";
import { promises as fsp } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { Args, LogEvent, LogsResponse, StateFile } from "./types.js";

function parseDuration(str: string): number {
  const m = String(str).match(/^(\d+)([smhd])$/i);
  if (!m) throw new Error(`Invalid duration: ${str} (use e.g. 30s, 15m, 2h, 1d)`);
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  switch (unit) {
    case "s":
      return n * 1000;
    case "m":
      return n * 60 * 1000;
    case "h":
      return n * 60 * 60 * 1000;
    case "d":
      return n * 24 * 60 * 60 * 1000;
  }
  throw new Error("unreachable");
}

function toISO(t: number): string {
  return new Date(t).toISOString();
}

function fromMaybeISO(v: string | undefined, fallbackMs: number): number {
  if (!v) return fallbackMs;
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error(`Invalid ISO date: ${v}`);
  return t;
}

function parseArgv(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (typeof next === "string" && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function csvEscape(val: unknown): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes("\"") || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function get(obj: unknown, pathStr: string): unknown {
  if (obj == null) return undefined;
  const parts = pathStr.split(".");
  let cur: any = obj as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function jittered(baseMs: number, factor = 0.2): number {
  const delta = baseMs * factor;
  return Math.round(baseMs - delta + Math.random() * (2 * delta));
}

async function writeCsvHeader(outPath: string, columns: string[]): Promise<void> {
  const header = columns.join(",") + "\n";
  try {
    await fsp.writeFile(outPath, header, { flag: "wx" });
  } catch (e: any) {
    if (e && e.code === "EEXIST") return;
    throw e;
  }
}

function resolveColumn(e: LogEvent, col: string): unknown {
  if (col === "id") return e.id;
  if (col === "timestamp") return e.attributes?.timestamp;
  const attrs = e.attributes || {};
  const nested = (attrs as any).attributes || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  let v = get(nested, col);
  if (v === undefined) v = get(attrs, col);
  return v;
}

async function appendCsvRows(outPath: string, columns: string[], events: LogEvent[]): Promise<void> {
  const lines = events.map((e) => columns.map((c) => csvEscape(resolveColumn(e, c))).join(","));
  if (lines.length > 0) {
    await fsp.appendFile(outPath, lines.join("\n") + "\n");
  }
}

async function readState(statePath: string): Promise<StateFile | null> {
  if (!(await fileExists(statePath))) return null;
  const raw = await fsp.readFile(statePath, "utf8");
  return JSON.parse(raw) as StateFile;
}

async function writeState(statePath: string, state: StateFile): Promise<void> {
  await fsp.writeFile(statePath, JSON.stringify(state, null, 2));
}

function pickRateLimitWait(headers: Headers): number {
  const retryAfter = headers.get("retry-after");
  if (retryAfter && !Number.isNaN(parseInt(retryAfter, 10))) {
    return parseInt(retryAfter, 10) * 1000;
  }
  const reset = headers.get("x-rate-limit-reset") || headers.get("x-ratelimit-reset");
  if (reset && !Number.isNaN(parseInt(reset, 10))) {
    const resetSec = parseInt(reset, 10);
    return Math.max(0, (resetSec * 1000) - Date.now());
  }
  return 2000;
}

async function fetchWithBackoff(url: string, init: RequestInit, maxRetries = 6): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    if (res.status === 429) {
      const wait = pickRateLimitWait(res.headers);
      const backoff = jittered(Math.min(60000, wait || 2000));
      console.warn(`429 Too Many Requests. Waiting ~${backoff}ms before retry...`);
      await sleep(backoff);
      attempt++;
      if (attempt > maxRetries) throw new Error(`Rate limited too many times.`);
      continue;
    }
    if (res.status >= 500) {
      const backoff = jittered(Math.min(60000, 1000 * Math.pow(2, attempt)));
      console.warn(`${res.status} Server error. Retrying in ~${backoff}ms...`);
      await sleep(backoff);
      attempt++;
      if (attempt > maxRetries) throw new Error(`Server error ${res.status} too many times.`);
      continue;
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    return res;
  }
}

async function queryLogs(params: {
  site: string;
  apiKey: string;
  appKey: string;
  query: string;
  fromISO: string;
  toISO: string;
  pageLimit: number;
  cursor?: string;
}): Promise<{ events: LogEvent[]; nextCursor?: string | null; rateRemaining?: number }> {
  const { site, apiKey, appKey, query, fromISO, toISO, pageLimit, cursor } = params;
  const url = `https://api.${site}/api/v2/logs/events/search`;
  const body: Record<string, unknown> = {
    filter: { query, from: fromISO, to: toISO },
    options: { timeOffset: 0, timezone: "UTC" },
    page: { limit: Math.min(1000, pageLimit) },
    sort: "desc",
  };
  if (cursor) (body.page as any).cursor = cursor; // eslint-disable-line @typescript-eslint/no-explicit-any

  const res = await fetchWithBackoff(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "dd-api-key": apiKey,
      "dd-application-key": appKey,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as LogsResponse;
  const events = json?.data ?? [];
  let nextCursor = json?.meta?.page?.after ?? null;
  if (!nextCursor && json?.links?.next) {
    try {
      const u = new URL(json.links.next);
      const c = u.searchParams.get("page[cursor]");
      if (c) nextCursor = c;
    } catch {
      // ignore
    }
  }
  const rateRemainingStr = res.headers.get("x-rate-limit-remaining") || res.headers.get("x-ratelimit-remaining") || "";
  const rateRemaining = rateRemainingStr ? parseInt(rateRemainingStr, 10) : undefined;
  return { events, nextCursor, rateRemaining };
}

function adjustWindowSize(currentMs: number, lastCount: number, target: number, minMs: number, maxMs: number): number {
  if (lastCount === 0) return Math.min(maxMs, Math.round(currentMs * 2));
  const ratio = lastCount / target;
  if (ratio > 1.5) return Math.max(minMs, Math.round(currentMs / 2));
  if (ratio < 0.5) return Math.min(maxMs, Math.round(currentMs * 1.5));
  return currentMs;
}

async function main(): Promise<void> {
  const argv = parseArgv(process.argv);
  if (argv.help || argv.h) {
    console.log(`Usage: node dist/index.js --query <QUERY> --columns <col1,col2,...> [options]\n\nOptions:\n  --from <ISO>                Start time (older). Default: 14 days ago\n  --to <ISO>                  End time (newer). Default: now\n  --out <path>                Output CSV file. Default: datadog-logs.csv\n  --page-limit <n>            Page size (<=1000). Default: 1000\n  --target-per-window <n>     Target logs per window. Default: 2000\n  --initial-window <dur>      Initial window (e.g. 15m). Default: 15m\n  --max-window <dur>          Max window size. Default: 6h\n  --min-window <dur>          Min window size. Default: 1m\n  --resume [true|false]       Resume from state. Default: true\n`);
    return;
  }

  const query = (argv.query as string) || "";
  const columns = String(argv.columns || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const outPath = (argv.out as string) || "datadog-logs.csv";
  const pageLimit = Math.min(1000, parseInt((argv["page-limit"] as string) || "1000", 10));
  const resume = argv.resume !== "false"; // default true
  const targetPerWindow = parseInt((argv["target-per-window"] as string) || "2000", 10);

  if (!query) throw new Error("--query is required");
  if (columns.length === 0) throw new Error("--columns is required (comma separated)");

  const now = Date.now();
  const defaultFrom = now - 14 * 24 * 60 * 60 * 1000;
  const fromMs = fromMaybeISO(argv.from as string | undefined, defaultFrom);
  const toMs = fromMaybeISO(argv.to as string | undefined, now);
  if (fromMs >= toMs) throw new Error("--from must be earlier than --to");

  const initialWindow = parseDuration((argv["initial-window"] as string) || "15m");
  const maxWindow = parseDuration((argv["max-window"] as string) || "6h");
  const minWindow = parseDuration((argv["min-window"] as string) || "1m");

  const site = process.env.DATADOG_SITE || "datadoghq.com";
  const apiKey = process.env.DATADOG_API_KEY;
  const appKey = process.env.DATADOG_APP_KEY;
  if (!apiKey || !appKey) throw new Error("Please set DATADOG_API_KEY and DATADOG_APP_KEY environment variables.");

  const statePath = outPath + ".state.json";
  let state: StateFile | null = null;
  if (resume) state = await readState(statePath);

  let currentTo = state?.currentTo ?? toMs; // newest boundary moving older
  let windowMs = state?.windowMs ?? initialWindow;
  let totalCount = state?.totalCount ?? 0;

  if (!(await fileExists(outPath))) {
    await writeCsvHeader(outPath, columns);
  }

  console.log(`Starting export`);
  console.log(`Query: ${query}`);
  console.log(`Range: ${toISO(fromMs)} -> ${toISO(toMs)} (desc)`);
  console.log(`Output: ${outPath}`);

  while (currentTo > fromMs) {
    const currentFrom = Math.max(fromMs, currentTo - windowMs);
    const fromISO = toISO(currentFrom);
    const toISOstr = toISO(currentTo);
    console.log(`Window: [${fromISO} .. ${toISOstr}]`);

    let cursor = state?.cursor || undefined;
    let windowCount = state?.windowCount || 0;
    let lastPageIds = state?.lastPageIds && Array.isArray(state.lastPageIds) ? state.lastPageIds : [];
    state = null; // clear carry-over state

    while (true) {
      const { events, nextCursor, rateRemaining } = await queryLogs({
        site,
        apiKey,
        appKey,
        query,
        fromISO,
        toISO: toISOstr,
        pageLimit,
        cursor,
      });

      let pageEvents = events;
      if (lastPageIds.length && pageEvents.length) {
        const idSet = new Set(lastPageIds);
        const before = pageEvents.length;
        pageEvents = pageEvents.filter((e) => !idSet.has(e.id));
        if (before !== pageEvents.length) {
          console.warn(`Filtered ${before - pageEvents.length} duplicate events on resume.`);
        }
      }

      if (rateRemaining !== undefined && !Number.isNaN(rateRemaining) && rateRemaining <= 1) {
        await sleep(1000);
      }

      if (pageEvents.length > 0) {
        await appendCsvRows(outPath, columns, pageEvents);
        totalCount += pageEvents.length;
        windowCount += pageEvents.length;
      }

      await writeState(statePath, {
        currentTo,
        windowMs,
        cursor: nextCursor || null,
        windowCount,
        totalCount,
        lastPageIds: (events || []).map((e) => e.id),
      });

      if (!nextCursor) break;
      cursor = nextCursor;
      lastPageIds = (events || []).map((e) => e.id);
    }

    console.log(`Window complete: ${windowCount} events`);
    windowMs = adjustWindowSize(windowMs, windowCount, targetPerWindow, minWindow, maxWindow);
    currentTo = currentFrom - 1; // avoid boundary duplicates

    await writeState(statePath, { currentTo, windowMs, cursor: null, windowCount: 0, totalCount });
  }

  console.log(`Done. Exported ${totalCount} events to ${outPath}`);
}

// Execute
main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});

