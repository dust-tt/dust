/**
 * Workspace branding assets — GCS path helpers and asset allowlist.
 *
 * GCS layout (private bucket):
 *   w/{wId}/branding/logo     — primary logo (light backgrounds)
 *   w/{wId}/branding/favicon  — square mark (256×256)
 *   w/{wId}/branding/og       — 1200×630 OG card (PNG, auto-generated)
 *
 * Keys are extensionless; content type lives in GCS object metadata.
 */

import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

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

export function buildBrandingAssetStoragePath(
  wId: string,
  asset: BrandingAssetName
): string {
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

// Takes `wId` directly rather than `Authenticator` because the public branding endpoint
// serves unauthenticated requests. No auth context is available at that call site.
export async function getBrandingAssetState(
  { wId }: { wId: string },
  asset: BrandingAssetName
): Promise<Result<BrandingAssetState, Error>> {
  try {
    const [metadata] = await getPrivateUploadBucket()
      .file(buildBrandingAssetStoragePath(wId, asset))
      .getMetadata();

    return new Ok({ version: String(metadata.generation ?? "") });
  } catch (err) {
    if (isGCSNotFoundError(err)) {
      return new Ok(null);
    }

    logger.error("Error fetching branding asset metadata", {
      wId,
      asset,
      error: normalizeError(err),
    });

    return new Err(normalizeError(err));
  }
}

export async function promoteBrandingAsset(
  auth: Authenticator,
  file: FileResource,
  asset: BrandingAssetName
): Promise<Result<void, Error>> {
  const wId = auth.getNonNullableWorkspace().sId;
  const srcPath = file.getCloudStoragePath(auth, "processed");
  try {
    await getPrivateUploadBucket().copyFile(
      srcPath,
      buildBrandingAssetStoragePath(wId, asset)
    );

    return new Ok(undefined);
  } catch (err) {
    logger.error("Error promoting branding asset", {
      wId,
      asset,
      error: normalizeError(err),
    });

    return new Err(normalizeError(err));
  }
}

export async function deleteBrandingAsset(
  auth: Authenticator,
  asset: BrandingAssetName
): Promise<Result<void, Error>> {
  const wId = auth.getNonNullableWorkspace().sId;

  try {
    await getPrivateUploadBucket().delete(
      buildBrandingAssetStoragePath(wId, asset),
      {
        ignoreNotFound: true,
      }
    );

    return new Ok(undefined);
  } catch (err) {
    if (isGCSNotFoundError(err)) {
      return new Ok(undefined);
    }

    logger.error("Error deleting branding asset", {
      wId,
      asset,
      error: normalizeError(err),
    });

    return new Err(normalizeError(err));
  }
}
