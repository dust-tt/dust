import type { AuthService } from "@extension/shared/services/auth";

export interface PlatformService {
  auth: AuthService;
  platform: "chrome" | "front";
}
