import type { PendingUpdate } from "@app/shared/lib/storage";
import type {
  BaseStorageData,
  StorageService,
} from "@app/shared/services/storage";

export interface ChromeStorageData extends BaseStorageData {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  pendingUpdate?: PendingUpdate;
  // conversationContext?: Record<string, ConversationContext>;
  // Tab content mapping
  [key: `tabContentContentFragmentId_${string}_${string}_${string}`]: string;
}

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
    await this.storage.remove([key]);
  }

  async clear(): Promise<void> {
    await this.storage.clear();
  }

  onChange(callback: (changes: Record<string, any>) => void): () => void {
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
