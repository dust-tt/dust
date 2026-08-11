import { z } from "zod";

/**
 * Cross-open persistence for the Frame SWR cache.
 *
 * Each (frame, viewer) pair owns one localStorage item holding the last known output of the
 * frame's persisted Pod Function reads. On the next open the entries are served as SWR
 * fallback data so the frame paints instantly while `revalidateIfStale` refreshes in the
 * background. Persistence is strictly best-effort: any storage failure silently degrades to
 * the previous per-mount behavior.
 *
 * The viz origin is shared by every workspace and viewer, so items are namespaced by frame
 * identifier AND viewer user id, and nothing is ever persisted for unauthenticated viewers.
 */

// Versioned prefix: bumping the version orphans (and eventually evicts) incompatible items.
const FRAME_CACHE_STORAGE_KEY_PREFIX = "dust:frameCache:v1:";

export const FRAME_CACHE_WRITE_DEBOUNCE_MS = 1_000;

// Per-frame entry count cap; least-recently-updated entries are evicted first.
export const FRAME_CACHE_MAX_ENTRIES = 50;

// Per-frame serialized payload cap. localStorage stores UTF-16 code units; we approximate
// 1 char ≈ 1 byte and compare the cap against the serialized string length.
export const FRAME_CACHE_MAX_ITEM_SIZE_BYTES = 512 * 1024;

// Cap on the number of persisted frame items across the shared viz origin.
export const FRAME_CACHE_MAX_FRAMES = 20;

// Entries older than this are dropped at hydration; stale-by-a-week data is worthless and
// only holds quota.
export const FRAME_CACHE_MAX_ENTRY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const PersistedEntrySchema = z.object({
  data: z.unknown(),
  updatedAtMs: z.number(),
});

type PersistedEntry = z.infer<typeof PersistedEntrySchema>;

const PersistedFrameCacheSchema = z.object({
  updatedAtMs: z.number(),
  entries: z.array(z.tuple([z.string(), PersistedEntrySchema])),
});

export function frameCacheStorageKey(
  identifier: string,
  userId: string
): string {
  return `${FRAME_CACHE_STORAGE_KEY_PREFIX}${identifier}:${userId}`;
}

// The SWR provider map stores one state object per serialized key; only `data` is persisted.
function isSWRStateWithData(state: unknown): state is { data: unknown } {
  return typeof state === "object" && state !== null && "data" in state;
}

interface FrameCachePersistenceOptions {
  // The live SWR provider map, read at flush time so writes always see the latest data.
  cache: ReadonlyMap<string, unknown>;
  storage: Storage;
  storageKey: string;
  // Injectable clock for tests.
  nowMs?: () => number;
}

export class FrameCachePersistence {
  private readonly cache: ReadonlyMap<string, unknown>;
  private readonly storage: Storage;
  private readonly storageKey: string;
  private readonly nowMs: () => number;

  // Entries carried over from the persisted item (and previous flushes). Keys recorded this
  // session overwrite their baseline entry at flush; unrecorded baseline entries are kept so
  // inputs that vary between sessions survive until LRU eviction or expiry.
  private baseline = new Map<string, PersistedEntry>();
  private readonly recordedAtMs = new Map<string, number>();
  private readonly droppedKeys = new Set<string>();
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private disabled = false;

  constructor({
    cache,
    storage,
    storageKey,
    nowMs,
  }: FrameCachePersistenceOptions) {
    this.cache = cache;
    this.storage = storage;
    this.storageKey = storageKey;
    this.nowMs = nowMs ?? Date.now;
  }

  /**
   * Load the persisted entries for this (frame, viewer) pair, dropping expired ones.
   * Returns serialized SWR key -> data, ready to be used as SWR fallback.
   */
  hydrate(): Map<string, unknown> {
    const hydrated = new Map<string, unknown>();

    // localStorage access and JSON parsing can both throw (storage disabled, corrupted
    // payload); persistence is best-effort so start cold instead of surfacing the error.
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw === null) {
        return hydrated;
      }

      const parsed = PersistedFrameCacheSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        this.storage.removeItem(this.storageKey);
        return hydrated;
      }

      const expiryCutoffMs = this.nowMs() - FRAME_CACHE_MAX_ENTRY_AGE_MS;
      for (const [key, entry] of parsed.data.entries) {
        if (entry.updatedAtMs >= expiryCutoffMs && entry.data !== undefined) {
          this.baseline.set(key, entry);
          hydrated.set(key, entry.data);
        }
      }
    } catch (_error) {
      return hydrated;
    }

    return hydrated;
  }

  /**
   * Mark a serialized SWR key as persistable and freshly used, then schedule a debounced
   * write. Only recorded keys ever pick up new data; unrecorded SWR keys (identity,
   * mutations) never reach storage.
   */
  recordEntry(serializedKey: string): void {
    if (this.disabled) {
      return;
    }

    this.droppedKeys.delete(serializedKey);
    this.recordedAtMs.set(serializedKey, this.nowMs());
    this.scheduleWrite();
  }

  /**
   * Remove a key from persistence (opt-out hooks). Also forgets any previously persisted
   * entry for the key.
   */
  dropEntry(serializedKey: string): void {
    if (this.disabled) {
      return;
    }

    if (
      this.baseline.has(serializedKey) ||
      this.recordedAtMs.has(serializedKey)
    ) {
      this.baseline.delete(serializedKey);
      this.recordedAtMs.delete(serializedKey);
      this.droppedKeys.add(serializedKey);
      this.scheduleWrite();
    }
  }

  /** Write now, canceling any pending debounced write. */
  flush(): void {
    if (this.writeTimer !== null) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    if (this.disabled) {
      return;
    }

    // Serialization and storage writes touch environment-controlled surfaces (quota, private
    // browsing, non-JSON data injected via mutate); degrade to no persistence on failure.
    try {
      this.writeToStorage();
    } catch (_error) {
      this.disabled = true;
    }
  }

  dispose(): void {
    if (this.writeTimer !== null) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.disabled = true;
  }

  private scheduleWrite(): void {
    if (this.writeTimer !== null) {
      return;
    }

    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.flush();
    }, FRAME_CACHE_WRITE_DEBOUNCE_MS);
  }

  private writeToStorage(): void {
    const merged = new Map(this.baseline);
    this.recordedAtMs.forEach((recordedAtMs, key) => {
      const state = this.cache.get(key);
      if (isSWRStateWithData(state) && state.data !== undefined) {
        merged.set(key, { data: state.data, updatedAtMs: recordedAtMs });
      }
    });
    this.droppedKeys.forEach((key) => {
      merged.delete(key);
    });

    // Most recently updated first, then apply the entry-count cap.
    let entries = Array.from(merged.entries())
      .sort(([, a], [, b]) => b.updatedAtMs - a.updatedAtMs)
      .slice(0, FRAME_CACHE_MAX_ENTRIES);

    let payload = this.serialize(entries);
    // Byte cap: drop least-recently-updated entries until the payload fits.
    while (
      payload.length > FRAME_CACHE_MAX_ITEM_SIZE_BYTES &&
      entries.length > 0
    ) {
      entries = entries.slice(0, -1);
      payload = this.serialize(entries);
    }

    this.baseline = new Map(entries);

    if (entries.length === 0) {
      this.storage.removeItem(this.storageKey);
      return;
    }

    if (!this.trySetItem(payload)) {
      // Quota pressure: evict other frames' items, oldest first, and retry after each.
      const evictable = this.listFrameItems().filter(
        (item) => item.key !== this.storageKey
      );
      let written = false;
      for (const item of evictable) {
        this.storage.removeItem(item.key);
        if (this.trySetItem(payload)) {
          written = true;
          break;
        }
      }
      if (!written) {
        this.disabled = true;
        return;
      }
    }

    this.pruneFrameCount();
  }

  private serialize(entries: [string, PersistedEntry][]): string {
    return JSON.stringify({ updatedAtMs: this.nowMs(), entries });
  }

  private trySetItem(payload: string): boolean {
    // setItem throws on quota exhaustion; the caller handles eviction.
    try {
      this.storage.setItem(this.storageKey, payload);
      return true;
    } catch (_error) {
      return false;
    }
  }

  // Every frame item on the origin, least recently updated first. Unparseable items sort
  // first so they are evicted before valid ones.
  private listFrameItems(): { key: string; updatedAtMs: number }[] {
    const items: { key: string; updatedAtMs: number }[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key === null || !key.startsWith(FRAME_CACHE_STORAGE_KEY_PREFIX)) {
        continue;
      }

      let updatedAtMs = 0;
      // Other items may be corrupted or from another version; treat them as oldest.
      try {
        const raw = this.storage.getItem(key);
        const parsed = PersistedFrameCacheSchema.safeParse(
          raw === null ? null : JSON.parse(raw)
        );
        if (parsed.success) {
          updatedAtMs = parsed.data.updatedAtMs;
        }
      } catch (_error) {
        // Keep updatedAtMs at 0 so the item is evicted first.
      }

      items.push({ key, updatedAtMs });
    }

    return items.sort((a, b) => a.updatedAtMs - b.updatedAtMs);
  }

  private pruneFrameCount(): void {
    // Cheap key count first: parsing every frame item on each flush would be wasteful.
    let frameKeyCount = 0;
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key !== null && key.startsWith(FRAME_CACHE_STORAGE_KEY_PREFIX)) {
        frameKeyCount += 1;
      }
    }
    if (frameKeyCount <= FRAME_CACHE_MAX_FRAMES) {
      return;
    }

    const items = this.listFrameItems();

    for (const item of items.slice(0, items.length - FRAME_CACHE_MAX_FRAMES)) {
      if (item.key !== this.storageKey) {
        this.storage.removeItem(item.key);
      }
    }
  }
}
