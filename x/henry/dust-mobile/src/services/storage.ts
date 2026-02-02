import * as SecureStore from "expo-secure-store";
import { MMKV } from "react-native-mmkv";
import type { StoredTokens, StoredUser } from "../types";

const mmkv = new MMKV();

const TOKENS_KEY = "dust_tokens";
const USER_KEY = "dust_user";

// Secure storage for tokens (encrypted, async)
export const secureStorage = {
  async getTokens(): Promise<StoredTokens | null> {
    const raw = await SecureStore.getItemAsync(TOKENS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredTokens;
  },

  async setTokens(tokens: StoredTokens): Promise<void> {
    await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens));
  },

  async clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKENS_KEY);
  },
};

// Fast MMKV storage for user data (not sensitive)
export const appStorage = {
  getUser(): StoredUser | null {
    const raw = mmkv.getString(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  },

  setUser(user: StoredUser): void {
    mmkv.set(USER_KEY, JSON.stringify(user));
  },

  clearUser(): void {
    mmkv.delete(USER_KEY);
  },
};
