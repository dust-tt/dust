import type { StorageService } from "@app/shared/services/storage";
import browser from "webextension-polyfill";

export class FirefoxStorageService implements StorageService {
  private storage = browser.storage.local;

  async get<T>(key: string): Promise<T | undefined> {
    const result = await this.storage.get([key]);

    return result[key];
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.storage.set({ [key]: value });
  }

  async delete(key: string): Promise<void> {
    await this.storage.remove([key]);
  }

  async clear() {
    await this.storage.clear();
  }

  onChanged(callback: (changes: Record<string, any>) => void): () => void {
    const listener = (
      changes: Record<string, any>
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
