import * as SecureStore from "expo-secure-store";

export interface StorageService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

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
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (!value) {
        return null;
      }
      const parsed: unknown = JSON.parse(value);
      return parsed as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  }

  async clear(): Promise<void> {
    await Promise.all(STORAGE_KEYS.map((key) => this.remove(key)));
  }
}

export const storageService = new MobileStorageService();
