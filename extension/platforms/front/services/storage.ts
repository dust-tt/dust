import type { StorageService } from "@app/shared/services/storage";

type StorageListener = (changes: Record<string, any>) => void;

export class FrontStorageService implements StorageService {
  private listeners: Set<StorageListener>;

  constructor() {
    this.listeners = new Set();
  }

  private notifyListeners(key: string, newValue: any) {
    const changes = { [key]: newValue };

    this.listeners.forEach((listener) => listener(changes));
  }

  async get<T>(key: string): Promise<T | undefined> {
    const item = localStorage.getItem(key);
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
    localStorage.setItem(key, JSON.stringify(value));

    // Notify listeners of the change in current window.
    this.notifyListeners(key, value);
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(key);

    // Notify listeners of the removal in current window.
    this.notifyListeners(key, undefined);
  }

  async clear(): Promise<void> {
    localStorage.clear();
    // Notify listeners of clear in current window.
    this.notifyListeners("", null);
  }

  onChanged(callback: (changes: Record<string, any>) => void): () => void {
    // Add to our set of listeners.
    this.listeners.add(callback);

    // Handle storage events from other windows/tabs.
    const storageListener = (event: StorageEvent) => {
      // Ignore clear() calls.
      if (!event.key) {
        return;
      }

      try {
        const newValue = event.newValue
          ? JSON.parse(event.newValue)
          : undefined;
        callback({ [event.key]: newValue });
      } catch {
        // Handle parse errors gracefully.
        callback({ [event.key]: undefined });
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
