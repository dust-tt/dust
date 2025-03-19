import type { StorageService } from "@app/shared/services/storage";

// TODO(2025-03-19 flav): Add front platform.
const PLATFORM_TYPES = ["chrome"] as const;
export type PlatformType = (typeof PLATFORM_TYPES)[number];

interface ConversationContext {
  includeCurrentPage: boolean;
}

export type Theme = "light" | "dark" | "system";
export const DEFAULT_THEME: Theme = "system";

export interface PlatformService {
  platform: PlatformType;
  storage: StorageService;

  getConversationContext(conversationId: string): Promise<ConversationContext>;
  setConversationsContext(
    conversationsWithContext: Record<string, ConversationContext>
  ): Promise<void>;

  getTheme(): Promise<Theme>;
  saveTheme(theme: Theme): Promise<void>;
}

// Shared logic that works across all platforms
export class BasePlatformService implements PlatformService {
  platform: PlatformType;
  storage: StorageService;

  constructor(platform: PlatformType, storage: StorageService) {
    this.platform = platform;
    this.storage = storage;
  }

  // Conversations.
  async getConversationContext(conversationId: string) {
    const contexts =
      (await this.storage.get<Record<string, ConversationContext>>(
        "conversationContext"
      )) || {};
    return contexts[conversationId] || { includeCurrentPage: false };
  }

  async setConversationsContext(contexts: Record<string, ConversationContext>) {
    const existing =
      (await this.storage.get<Record<string, ConversationContext>>(
        "conversationContext"
      )) || {};
    await this.storage.set("conversationContext", { ...existing, ...contexts });
  }

  // Theme.
  async getTheme() {
    const result = await this.storage.get<Theme>("theme");

    return result ?? DEFAULT_THEME;
  }

  async saveTheme(theme: string) {
    console.log("saveTheme", theme);
    await this.storage.set("theme", theme);
  }
}

export function isValidPlatform(platform: unknown): platform is PlatformType {
  return (
    typeof platform === "string" &&
    PLATFORM_TYPES.includes(platform as PlatformType)
  );
}
