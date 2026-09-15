import { resolvePackageRelativeToScopedPath } from "@app/lib/api/frames/package_file_ref_paths";
import type {
  AuthorizedFileAccessAllowlist,
  FileShareScope,
  FileUseCase,
} from "@app/types/files";
import { legacyScopedPathsMatch } from "@app/types/mount_path";
import { assertNever } from "@app/types/shared/utils/assert_never";

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
    switch (r.kind) {
      case "file_id":
      case "frame_relative_path":
        if (r.ref === requestedRef) {
          return true;
        }
        break;
      case "canonical_path":
        if (
          r.ref === requestedRef ||
          legacyScopedPathsMatch(r.legacyPath, requestedRef)
        ) {
          return true;
        }
        break;
      default:
        assertNever(r);
    }
  }

  return false;
}

/** file_id refs are only allowlistable for user-scoped conversation, tool, and pod files. */
export function isVerifiableAuthorizedFileIdRefUseCase(
  useCase: FileUseCase
): boolean {
  switch (useCase) {
    case "tool_output":
    case "conversation":
    case "project_context":
      return true;
    case "avatar":
    case "upsert_document":
    case "folders_document":
    case "upsert_table":
    case "skill_attachment":
    case "workspace_branding":
      return false;
    default:
      assertNever(useCase);
  }
}

/**
 * Resolve an allowlisted request to a readable scoped path.
 * `frame_relative_path` joins against the Frame's *current* package root so moves survive
 * without republishing.
 */
export function resolveAllowlistedCanonicalPath(
  authorizedFileAccess: AuthorizedFileAccessAllowlist,
  requestedRef: string,
  { packageRoot }: { packageRoot: string | null } = { packageRoot: null }
): string | null {
  for (const r of authorizedFileAccess.refs) {
    switch (r.kind) {
      case "file_id":
        break;
      case "frame_relative_path": {
        if (r.ref !== requestedRef) {
          break;
        }
        if (!packageRoot) {
          return null;
        }
        return resolvePackageRelativeToScopedPath({
          relativePath: r.ref,
          frameRoot: packageRoot,
        });
      }
      case "canonical_path": {
        if (
          r.ref === requestedRef ||
          legacyScopedPathsMatch(r.legacyPath, requestedRef)
        ) {
          return r.ref;
        }
        break;
      }
      default:
        assertNever(r);
    }
  }

  return null;
}
