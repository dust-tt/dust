import type { StorageService } from "@extension/shared/services/storage";

type StorageListener = (changes: Record<string, any>) => void;

export class LocalStorageService implements StorageService {
  private listeners: Set<StorageListener>;
  private getKeyPrefix: () => string;

  constructor(getKeyPrefix: () => string = () => "") {
    this.listeners = new Set();
    this.getKeyPrefix = getKeyPrefix;
  }

  private notifyListeners(changes: Record<string, any>) {
    this.listeners.forEach((listener) => listener(changes));
  }

  async get<T>(key: string): Promise<T | undefined> {
    const item = localStorage.getItem(this.getKeyPrefix() + key);
    if (!item) {
      return undefined;
    }
    try {
      return JSON.parse(item);
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: any): Promise<void> {
    localStorage.setItem(this.getKeyPrefix() + key, JSON.stringify(value));

    // Notify listeners of the change in current window.
    this.notifyListeners({ [key]: value });
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(this.getKeyPrefix() + key);

    // Notify listeners of the removal in current window.
    this.notifyListeners({ [key]: undefined });
  }

  async clear(): Promise<void> {
    const prefix = this.getKeyPrefix();
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (storageKey?.startsWith(prefix)) {
        keys.push(storageKey);
      }
    }

    const changes: Record<string, any> = {};
    for (const storageKey of keys) {
      localStorage.removeItem(storageKey);
      changes[storageKey.slice(prefix.length)] = undefined;
    }

    // Notify listeners of the removals in current window.
    if (keys.length > 0) {
      this.notifyListeners(changes);
    }
  }

  onChanged(callback: (changes: Record<string, any>) => void): () => void {
    // Add to our set of listeners.
    this.listeners.add(callback);

    // Handle storage events from other windows/tabs.
    const storageListener = (event: StorageEvent) => {
      // Ignore localStorage.clear() calls and sessionStorage events.
      if (!event.key || event.storageArea !== localStorage) {
        return;
      }

      // Ignore keys not written with our prefix.
      const prefix = this.getKeyPrefix();
      if (!event.key.startsWith(prefix)) {
        return;
      }
      const key = event.key.slice(prefix.length);

      try {
        const newValue = event.newValue
          ? JSON.parse(event.newValue)
          : undefined;
        callback({ [key]: newValue });
      } catch {
        // Handle parse errors gracefully.
        callback({ [key]: undefined });
      }
    };

    window.addEventListener("storage", storageListener);

    // Return cleanup function.
    return () => {
      this.listeners.delete(callback);
      window.removeEventListener("storage", storageListener);
    };
  }
}
