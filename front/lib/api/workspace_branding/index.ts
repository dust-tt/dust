/**
 * Workspace branding assets, GCS path helpers and asset allowlist.
 *
 * GCS layout (private bucket):
 *   w/{wId}/branding/logo     primary logo (light backgrounds)
 *   w/{wId}/branding/favicon  square mark (256x256)
 *   w/{wId}/branding/og       1200x630 OG card (PNG, auto-generated)
 *
 * Keys are extensionless, content type lives in GCS object metadata.
 */

import { type Authenticator, getFeatureFlagsForWorkspace } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export { generateAndStoreOgImage } from "./og";
export type {
  BrandingAssetName,
  BrandingAssetState,
  UserUploadableBrandingAssetName,
} from "./paths";
export {
  BRANDING_ASSET_NAMES,
  BRANDING_DEFAULT_ASSET_PATHS,
  buildBrandingAssetPublicUrl,
  buildBrandingAssetStoragePath,
  isBrandingAssetName,
  USER_UPLOADABLE_BRANDING_ASSET_NAMES,
} from "./paths";

import type { BrandingAssetName, BrandingAssetState } from "./paths";
import {
  buildBrandingAssetPublicUrl,
  buildBrandingAssetStoragePath,
} from "./paths";

// Takes `wId` directly rather than `Authenticator` because the public branding endpoint
// serves unauthenticated requests. No auth context is available at that call site.
export async function getBrandingAssetState(
  { wId }: { wId: string },
  asset: BrandingAssetName
): Promise<Result<BrandingAssetState, Error>> {
  try {
    const [metadata] = await getPrivateUploadBucket()
      .file(buildBrandingAssetStoragePath({ asset, wId }))
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

export async function getWorkspaceBrandingPublicUrls(
  workspace: WorkspaceResource
): Promise<{
  faviconUrl: string | null;
  logoUrl: string | null;
  ogImageUrl: string | null;
}> {
  const featureFlags = await getFeatureFlagsForWorkspace(
    renderLightWorkspaceType({ workspace })
  );
  if (!featureFlags.includes("whitelabel_frames")) {
    return { faviconUrl: null, logoUrl: null, ogImageUrl: null };
  }

  const [logoState, faviconState, ogState] = await Promise.all([
    getBrandingAssetState({ wId: workspace.sId }, "logo"),
    getBrandingAssetState({ wId: workspace.sId }, "favicon"),
    getBrandingAssetState({ wId: workspace.sId }, "og"),
  ]);

  return {
    faviconUrl:
      faviconState.isOk() && faviconState.value
        ? buildBrandingAssetPublicUrl(
            { asset: "favicon", wId: workspace.sId },
            {
              version: faviconState.value.version,
            }
          )
        : null,
    logoUrl:
      logoState.isOk() && logoState.value
        ? buildBrandingAssetPublicUrl(
            { asset: "logo", wId: workspace.sId },
            {
              version: logoState.value.version,
            }
          )
        : null,
    ogImageUrl:
      ogState.isOk() && ogState.value
        ? buildBrandingAssetPublicUrl(
            { asset: "og", wId: workspace.sId },
            {
              version: ogState.value.version,
            }
          )
        : null,
  };
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
      buildBrandingAssetStoragePath({ asset, wId })
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
      buildBrandingAssetStoragePath({ asset, wId }),
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
