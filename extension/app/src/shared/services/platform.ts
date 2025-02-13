import type { ExtensionWorkspaceType } from "@dust-tt/client";
import type { FileUploaderService } from "@extension/hooks/useFileUploaderService";
import type { StorageService } from "@extension/shared/interfaces/storage";
import type { AuthService } from "@extension/shared/services/auth";
import type { CaptureService } from "@extension/shared/services/capture";

export interface AttachButtonProps {
  isLoading: boolean;
  owner: ExtensionWorkspaceType;
  isBlinking: boolean;
  fileUploaderService: FileUploaderService;
}

export interface PlatformComponents {
  AttachButtons: React.ComponentType<AttachButtonProps>;
}

export interface PlatformService {
  auth: AuthService;
  capture: CaptureService;
  components: PlatformComponents;
  platform: "chrome" | "front";
  storage: StorageService;
}
