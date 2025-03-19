import type { UploadedContentFragmentTypeWithKind } from "@app/shared/lib/types";
import type { AuthService, StoredUser } from "@app/shared/services/auth";
import type { StorageService } from "@app/shared/services/storage";
import type { ContentFragmentType } from "@dust-tt/client";

// TODO(2025-03-19 flav): Add front platform.
const PLATFORM_TYPES = ["chrome"] as const;
export type PlatformType = (typeof PLATFORM_TYPES)[number];

interface ConversationContext {
  includeCurrentPage: boolean;
}

export type Theme = "light" | "dark" | "system";
export const DEFAULT_THEME: Theme = "system";

export abstract class PlatformService {
  auth: AuthService;
  platform: PlatformType;
  storage: StorageService;

  constructor(
    platform: PlatformType,
    authCls: new (storage: StorageService) => AuthService,
    storage: StorageService
  ) {
    this.auth = new authCls(storage);
    this.platform = platform;
    this.storage = storage;
  }

  // Conversations.
  async getConversationContext(
    conversationId: string
  ): Promise<ConversationContext> {
    const contexts =
      (await this.storage.get<Record<string, ConversationContext>>(
        "conversationContext"
      )) || {};
    return contexts[conversationId] || { includeCurrentPage: false };
  }

  async setConversationsContext(
    contexts: Record<string, ConversationContext>
  ): Promise<void> {
    const existing =
      (await this.storage.get<Record<string, ConversationContext>>(
        "conversationContext"
      )) || {};
    await this.storage.set("conversationContext", { ...existing, ...contexts });
  }

  // Theme.
  async getTheme(): Promise<Theme> {
    const result = await this.storage.get<Theme>("theme");
    return result ?? DEFAULT_THEME;
  }

  async saveTheme(theme: Theme): Promise<void> {
    await this.storage.set("theme", theme);
  }

  // Workspace.
  async saveSelectedWorkspace({
    workspaceId,
  }: {
    workspaceId: string;
  }): Promise<StoredUser> {
    const storedUser = await this.auth.getStoredUser();
    if (!storedUser) {
      throw new Error("No user found.");
    }
    storedUser.selectedWorkspace = workspaceId;
    await this.storage.set("user", storedUser);
    return storedUser;
  }

  async clearStoredData(): Promise<void> {
    await Promise.all([
      this.storage.delete("accessToken"),
      this.storage.delete("expiresAt"),
      this.storage.delete("refreshToken"),
      this.storage.delete("user"),
    ]);
  }

  // Abstract methods that must be implemented by platform-specific classes
  abstract getFileContentFragmentId(
    conversationId: string,
    file: UploadedContentFragmentTypeWithKind
  ): Promise<string | null>;

  abstract saveFilesContentFragmentIds(args: {
    conversationId: string;
    uploadedFiles: UploadedContentFragmentTypeWithKind[];
    createdContentFragments: ContentFragmentType[];
  }): Promise<void>;
}

// Shared logic that works across all platforms
export class BasePlatformService extends PlatformService {
  constructor(
    platform: PlatformType,
    authCls: new (storage: StorageService) => AuthService,
    storage: StorageService
  ) {
    super(platform, authCls, storage);
  }

  // Content fragments.
  async getFileContentFragmentId(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    conversationId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    file: UploadedContentFragmentTypeWithKind
  ): Promise<string | null> {
    throw new Error("Platform specific implementation required.");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async saveFilesContentFragmentIds(args: {
    conversationId: string;
    uploadedFiles: UploadedContentFragmentTypeWithKind[];
    createdContentFragments: ContentFragmentType[];
  }): Promise<void> {
    throw new Error("Platform specific implementation required.");
  }
}

export function isValidPlatform(platform: unknown): platform is PlatformType {
  return (
    typeof platform === "string" &&
    PLATFORM_TYPES.includes(platform as PlatformType)
  );
}
