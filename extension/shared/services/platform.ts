import type { UploadedContentFragmentTypeWithKind } from "@app/shared/lib/types";
import type { AuthService, StoredUser } from "@app/shared/services/auth";
import type { CaptureService } from "@app/shared/services/capture";
import type { McpService } from "@app/shared/services/mcp";
import type { StorageService } from "@app/shared/services/storage";
import type { FileUploaderService } from "@app/ui/hooks/useFileUploaderService";
import type {
  ContentFragmentType,
  ExtensionWorkspaceType,
} from "@dust-tt/client";
import type { ComponentType } from "react";

const PLATFORM_TYPES = ["chrome", "front"] as const;
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

function getTabContentKey(
  conversationId: string,
  rawUrl: string,
  title: string
) {
  return `tabContentContentFragmentId_${conversationId}_${rawUrl}_${title}`;
}

export abstract class CorePlatformService {
  readonly auth: AuthService;
  readonly capture: CaptureService;
  readonly messaging?: BrowserMessagingService;
  readonly platform: PlatformType;
  readonly storage: StorageService;
  readonly mcp?: McpService;

  constructor(
    platform: PlatformType,
    authCls: new (storage: StorageService) => AuthService,
    storage: StorageService,
    capture: CaptureService,
    browserMessaging?: BrowserMessagingService,
    mcp?: McpService
  ) {
    this.platform = platform;
    this.auth = new authCls(storage);
    this.storage = storage;
    this.messaging = browserMessaging;
    this.capture = capture;
    this.mcp = mcp;
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

  /**
   * Retrieves the content fragment ID to supersede for a given file.
   * Always returns null if the file is not a tab content.
   */
  async getFileContentFragmentId(
    conversationId: string,
    file: UploadedContentFragmentTypeWithKind
  ) {
    if (file.kind !== "tab_content" || !file.url) {
      return null;
    }

    const key = getTabContentKey(conversationId, file.url, file.title);
    const result = await this.storage.get<string>(key);
    return result ?? null;
  }

  /**
   * Saves the mapping between TabContent (based on conversation id and url) and content fragment id.
   * Doesn't save anything for files that are not tab content.
   * Needs to be called after calling postMessage or createConversation with:
   * - the conversation id
   * - the files that were uploaded (including the "kind", either attachment or tab_content)
   * - the content fragments that were created
   *
   * This mapping is then used such that we superseed existing tab content content fragments
   * with the newly created ones if it's for the same URL / conversation.
   */
  async saveFilesContentFragmentIds({
    conversationId,
    createdContentFragments,
    uploadedFiles,
  }: {
    conversationId: string;
    createdContentFragments: ContentFragmentType[];
    uploadedFiles: UploadedContentFragmentTypeWithKind[];
  }) {
    const tabContentFileIds = new Set(
      uploadedFiles.filter((f) => f.kind === "tab_content").map((f) => f.fileId)
    );
    if (tabContentFileIds.size === 0) {
      return;
    }

    const tabContentContentFragments = createdContentFragments.filter(
      (cf) =>
        cf.fileId &&
        tabContentFileIds.has(cf.fileId) &&
        cf.contentFragmentVersion === "latest"
    );

    for (const cf of tabContentContentFragments) {
      if (!cf.sourceUrl) {
        continue;
      }
      const key = getTabContentKey(conversationId, cf.sourceUrl, cf.title);
      await this.storage.set(key, cf.contentFragmentId);
    }
  }
}

export abstract class PlatformService extends CorePlatformService {
  readonly supportsMCP: boolean = false;
  // Abstract methods that must be implemented by platform-specific classes.

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
