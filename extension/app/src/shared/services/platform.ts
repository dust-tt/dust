import type { StorageService } from "@extension/shared/interfaces/storage";
import type { AuthService } from "@extension/shared/services/auth";

export interface PlatformService {
  auth: AuthService;
  platform: "chrome" | "front";
  storage: StorageService;
}
