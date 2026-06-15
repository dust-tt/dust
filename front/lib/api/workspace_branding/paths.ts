import config from "@app/lib/api/config";

export const BRANDING_ASSET_NAMES = ["logo", "favicon", "og"] as const;
export type BrandingAssetName = (typeof BRANDING_ASSET_NAMES)[number];

export const USER_UPLOADABLE_BRANDING_ASSET_NAMES = [
  "logo",
  "favicon",
] as const;
export type UserUploadableBrandingAssetName =
  (typeof USER_UPLOADABLE_BRANDING_ASSET_NAMES)[number];

export type BrandingAssetState = { version: string } | null;

export function isBrandingAssetName(value: string): value is BrandingAssetName {
  return (BRANDING_ASSET_NAMES as readonly string[]).includes(value);
}

export function buildBrandingAssetStoragePath({
  asset,
  wId,
}: {
  asset: BrandingAssetName;
  wId: string;
}): string {
  return `w/${wId}/branding/${asset}`;
}

/**
 * Default public-asset paths (served from /public/static/branding/).
 * These are the Dust defaults returned when a workspace has no custom branding, is not entitled,
 * or has not uploaded a specific asset yet.
 */
export const BRANDING_DEFAULT_ASSET_PATHS: Record<BrandingAssetName, string> = {
  logo: "/static/DustHorizontalIcon.png",
  favicon: "/static/favicon.png",
  og: "/static/og/ic.png",
};

export function buildBrandingAssetPublicUrl(
  { asset, wId }: { asset: BrandingAssetName; wId: string },
  { version, baseUrl }: { version?: string; baseUrl?: string } = {}
): string {
  const base = baseUrl ?? config.getApiBaseUrl();
  const url = `${base}/api/v1/public/branding/${wId}/${asset}`;

  return version ? `${url}?v=${version}` : url;
}
