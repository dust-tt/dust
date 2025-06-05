import type { Cache as SWRCache } from "swr";

// Create a class that implements the cache provider interface
export class LocalStorageProvider implements SWRCache {
  // Returns all cache keys as an iterator
  keys() {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        keys.push(key);
      }
    }
    return keys[Symbol.iterator]();
  }

  set(key: string, value: any) {
    const stringified = JSON.stringify(value);
    localStorage.setItem(key, stringified);
  }

  get(key: string) {
    const value = localStorage.getItem(key);
    if (!value) {
      return undefined;
    }
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  delete(key: string) {
    localStorage.removeItem(key);
  }
}
