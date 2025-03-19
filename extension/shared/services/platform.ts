// TODO(2025-03-19 flav): Add front platform.
const PLATFORM_TYPES = ["chrome"] as const;
export type PlatformType = (typeof PLATFORM_TYPES)[number];

export interface PlatformService {
  platform: PlatformType;
}

export function isValidPlatform(platform: unknown): platform is PlatformType {
  return (
    typeof platform === "string" &&
    PLATFORM_TYPES.includes(platform as PlatformType)
  );
}
