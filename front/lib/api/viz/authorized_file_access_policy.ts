import { legacyScopedPathsMatch } from "@app/lib/api/files/mount_path";
import type {
  AuthorizedFileAccessAllowlist,
  FileShareScope,
} from "@app/types/files";

const FNV_OFFSET_BASIS_64 = BigInt("0xcbf29ce484222325");
const FNV_PRIME_64 = BigInt("0x100000001b3");
const FNV_MASK_64 = BigInt("0xffffffffffffffff");

/** Fast non-cryptographic hash for frame content change detection. */
export function computeFrameContentHash(frameContent: string): string {
  let hash = FNV_OFFSET_BASIS_64;
  for (let i = 0; i < frameContent.length; i++) {
    hash ^= BigInt(frameContent.charCodeAt(i));
    hash = (hash * FNV_PRIME_64) & FNV_MASK_64;
  }

  return hash.toString(16).padStart(16, "0");
}

export function isAllowlistStale(
  authorizedFileAccess: AuthorizedFileAccessAllowlist,
  currentContent: string
): boolean {
  return (
    authorizedFileAccess.frameContentHash !==
    computeFrameContentHash(currentContent)
  );
}

export function isAllowlistShareScopeStale(
  persistedShareScope: FileShareScope,
  currentShareScope: FileShareScope
): boolean {
  return persistedShareScope !== currentShareScope;
}

export function isAuthorizedFileRef(
  authorizedFileAccess: AuthorizedFileAccessAllowlist,
  requestedRef: string
): boolean {
  for (const r of authorizedFileAccess.refs) {
    if (r.kind === "file_id" && r.ref === requestedRef) {
      return true;
    }

    if (r.kind === "canonical_path") {
      if (
        r.ref === requestedRef ||
        legacyScopedPathsMatch(r.legacyPath, requestedRef)
      ) {
        return true;
      }
    }
  }

  return false;
}
