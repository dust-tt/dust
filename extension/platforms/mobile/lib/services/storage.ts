import * as SecureStore from "expo-secure-store";
import { MMKV } from "react-native-mmkv";

import type { StorageService } from "@app/shared/services/storage";
import type { StoredUser } from "@app/shared/services/auth";

// MMKV instance for fast synchronous reads of non-sensitive data
const mmkv = new MMKV();

// Keys stored in SecureStore (sensitive, encrypted)
const SECURE_KEYS = ["accessToken", "refreshToken", "expiresAt"] as const;
type SecureKey = (typeof SECURE_KEYS)[number];

// Keys stored in MMKV (non-sensitive, fast synchronous access)
const MMKV_KEYS = ["user"] as const;
type MMKVKey = (typeof MMKV_KEYS)[number];

function isSecureKey(key: string): key is SecureKey {
  return SECURE_KEYS.includes(key as SecureKey);
}

function isMMKVKey(key: string): key is MMKVKey {
  return MMKV_KEYS.includes(key as MMKVKey);
}

/**
 * Hybrid storage service:
 * - SecureStore for sensitive tokens (encrypted, async)
 * - MMKV for user data (fast synchronous reads)
 */
export class MobileStorageService implements StorageService {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      if (isMMKVKey(key)) {
        const value = mmkv.getString(key);
        if (!value) return undefined;
        return JSON.parse(value) as T;
      }

      // SecureStore for tokens
      const value = await SecureStore.getItemAsync(key);
      if (!value) return undefined;
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const serialized = JSON.stringify(value);

    if (isMMKVKey(key)) {
      mmkv.set(key, serialized);
      return;
    }

    await SecureStore.setItemAsync(key, serialized);
  }

  async delete(key: string): Promise<void> {
    if (isMMKVKey(key)) {
      mmkv.delete(key);
      return;
    }

    await SecureStore.deleteItemAsync(key);
  }

  async clear(): Promise<void> {
    // Clear MMKV keys
    for (const key of MMKV_KEYS) {
      mmkv.delete(key);
    }

    // Clear SecureStore keys
    await Promise.all(SECURE_KEYS.map((key) => SecureStore.deleteItemAsync(key)));
  }

  // Mobile doesn't support change listeners, but interface requires it
  onChanged(_callback: (changes: Record<string, unknown>) => void): () => void {
    return () => {};
  }
}

export const storageService = new MobileStorageService();

/**
 * Direct MMKV access for synchronous reads (hot path optimization).
 * Use this when you need immediate access without async overhead.
 */
export const appStorage = {
  getUser(): StoredUser | null {
    const raw = mmkv.getString("user");
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  },

  setUser(user: StoredUser): void {
    mmkv.set("user", JSON.stringify(user));
  },

  clearUser(): void {
    mmkv.delete("user");
  },
};
