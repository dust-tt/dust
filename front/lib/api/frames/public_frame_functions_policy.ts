import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { FileShareScope } from "@app/types/files";
import { isFramesV2PublicFunctionsEnabled } from "@app/types/shared/feature_flags";

/**
 * @cc [owner:achilleburah,label:security;product] public-functions-served-only-when-allowed
 * True MUST be returned only for the `public` share scope, in the workspace of `auth`, when its
 * sharing policy is `all_scopes` and public Frame functions are enabled for it (see
 * isFramesV2PublicFunctionsEnabled). Every condition MUST be read when called, so a revoked share,
 * policy or flag refuses the next request.
 */
export async function canServePublicFrameFunctions(
  auth: Authenticator,
  shareScope: FileShareScope
): Promise<boolean> {
  return (
    shareScope === "public" &&
    auth.getNonNullableWorkspace().sharingPolicy === "all_scopes" &&
    isFramesV2PublicFunctionsEnabled(await getFeatureFlags(auth))
  );
}
