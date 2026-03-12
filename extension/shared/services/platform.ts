import type { LightWorkspaceType } from "@app/types/user";
import type { AuthService } from "@extension/shared/services/auth";
import type { CaptureService } from "@extension/shared/services/capture";
import type { McpService } from "@extension/shared/services/mcp";
import type { StorageService } from "@extension/shared/services/storage";

export interface CaptureActions {
  onCapture: (type: "text" | "screenshot") => void;
  isCapturing: boolean;
}

export type UseCaptureActionsHook = (
  workspace: LightWorkspaceType,
  uploadContentTab: (options: {
    includeContent: boolean;
    includeCapture: boolean;
  }) => Promise<unknown>,
  isCapturing: boolean
) => CaptureActions | undefined;

const PLATFORM_TYPES = ["chrome", "front"] as const;
export type PlatformType = (typeof PLATFORM_TYPES)[number];

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

export abstract class PlatformService {
  readonly auth: AuthService;
  readonly capture?: CaptureService;
  readonly messaging?: BrowserMessagingService;
  readonly platform: PlatformType;
  readonly storage: StorageService;
  readonly mcp?: McpService;
  useCaptureActions: UseCaptureActionsHook = () => undefined;

  constructor(
    platform: PlatformType,
    authCls: new (storage: StorageService) => AuthService,
    storage: StorageService,
    capture?: CaptureService,
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

  async clearStoredData(): Promise<void> {
    await Promise.all([
      this.storage.delete("accessToken"),
      this.storage.delete("expiresAt"),
      this.storage.delete("refreshToken"),
      this.storage.delete("regionInfo"),
      this.storage.delete("selectedWorkspace"),
    ]);
  }
}

export function isValidPlatform(platform: unknown): platform is PlatformType {
  return (
    typeof platform === "string" &&
    PLATFORM_TYPES.includes(platform as PlatformType)
  );
}
