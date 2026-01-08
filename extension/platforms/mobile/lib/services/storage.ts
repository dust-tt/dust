import * as SecureStore from "expo-secure-store";

import type { StorageService } from "@app/shared/services/storage";

const STORAGE_KEYS = [
  "accessToken",
  "refreshToken",
  "expiresAt",
  "user",
] as const;

export class MobileStorageService implements StorageService {
  // Note: JSON.parse returns unknown, but we trust that data stored via set<T>
  // will match the expected type when retrieved. This is a pragmatic type assertion
  // for storage operations where we control both serialization and deserialization.
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (!value) {
        return undefined;
      }
      const parsed: unknown = JSON.parse(value);
      return parsed as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  }

  async clear(): Promise<void> {
    await Promise.all(STORAGE_KEYS.map((key) => this.delete(key)));
  }

  // Mobile doesn't support change listeners, but interface requires it
  onChanged(_callback: (changes: Record<string, unknown>) => void): () => void {
    // No-op for mobile - SecureStore doesn't have change events
    return () => {};
  }
}

export const storageService = new MobileStorageService();
