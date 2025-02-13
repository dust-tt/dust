import type { StorageService } from "@extension/shared/interfaces/storage";

export class ChromeStorageService implements StorageService {
  async get<T>(key: string | string[]): Promise<T | null> {
    if (Array.isArray(key)) {
      const result = await chrome.storage.local.get(key);
      return result as T;
    }

    const result = await chrome.storage.local.get([key]);
    return result[key] ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  }
}
