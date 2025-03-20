import type { UploadedContentFragmentTypeWithKind } from "@app/shared/lib/types";
import type { AuthService, StoredUser } from "@app/shared/services/auth";
import type { CaptureService } from "@app/shared/services/capture";
import type { StorageService } from "@app/shared/services/storage";
import type { FileUploaderService } from "@app/ui/hooks/useFileUploaderService";
import type {
  ContentFragmentType,
  ExtensionWorkspaceType,
} from "@dust-tt/client";
import type { ComponentType } from "react";

// TODO(2025-03-19 flav): Add front platform.
const PLATFORM_TYPES = ["chrome"] as const;
export type PlatformType = (typeof PLATFORM_TYPES)[number];

interface ConversationContext {
  includeCurrentPage: boolean;
}

export type Theme = "light" | "dark" | "system";
export const DEFAULT_THEME: Theme = "system";

export interface CaptureActionsProps {
  owner: ExtensionWorkspaceType;
  isBlinking: boolean;
  isLoading: boolean;
  fileUploaderService: FileUploaderService;
}

export interface BrowserMessagingService {
  addMessageListener: (
    listener: (message: any) => void | Promise<void>
  ) => () => void;
  removeMessageListener: (listener: (message: any) => void) => void;
  sendMessage<T = any, R = any>(
    message: T,
    callback?: (response: R) => void
  ): void | Promise<R>;
}

export abstract class CorePlatformService {
  readonly auth: AuthService;
  readonly capture: CaptureService;
  readonly messaging: BrowserMessagingService;
  readonly platform: PlatformType;
  readonly storage: StorageService;

  constructor(
    platform: PlatformType,
    authCls: new (storage: StorageService) => AuthService,
    storage: StorageService,
    browserMessaging: BrowserMessagingService,
    capture: CaptureService
  ) {
    this.platform = platform;
    this.auth = new authCls(storage);
    this.storage = storage;
    this.messaging = browserMessaging;
    this.capture = capture;
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

export abstract class PlatformService extends CorePlatformService {
  // Content capture.
  abstract getCaptureActionsComponent(): ComponentType<CaptureActionsProps>;

  abstract getSendWithActionsLabel(): string;
}

export function isValidPlatform(platform: unknown): platform is PlatformType {
  return (
    typeof platform === "string" &&
    PLATFORM_TYPES.includes(platform as PlatformType)
  );
}
