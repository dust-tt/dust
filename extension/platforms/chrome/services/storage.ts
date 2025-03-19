import type { StorageService } from "@app/shared/services/storage";

export class ChromeStorageService implements StorageService {
  private storage = chrome.storage.local;

  async get<T>(key: string): Promise<T | undefined> {
    const result = await this.storage.get([key]);

    return result[key];
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.storage.set({ [key]: value });
  }

  async delete(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storage.remove([key], () => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }

        return resolve();
      });
    });
  }

  async clear() {
    await this.storage.clear();
  }

  onChanged(callback: (changes: Record<string, any>) => void): () => void {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      const mappedChanges = Object.entries(changes).reduce(
        (acc, [key, value]) => {
          acc[key] = value.newValue;
          return acc;
        },
        {} as Record<string, any>
      );

      callback(mappedChanges);
    };

    this.storage.onChanged.addListener(listener);
    return () => this.storage.onChanged.removeListener(listener);
  }
}
