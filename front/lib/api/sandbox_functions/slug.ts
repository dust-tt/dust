import { resolveCanonicalScopedPath } from "@app/lib/api/files/mount_path";
import { normalizeAppPrefix } from "@app/types/api/pod_function_reference";
import { SANDBOX_FUNCTION_SLUG_SEGMENT_REGEX } from "@app/types/api/sandbox_functions";
import { parseCanonicalScopedPath } from "@app/types/file_system";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const SANDBOX_FUNCTION_SLUG_SEPARATOR = "__";

/**
 * Derive the app prefix a pod path belongs to: the normalized first path segment under the pod
 * root, or `null` for a path sitting directly at the pod root (no app folder).
 *
 * Shared by the two things an app namespaces — its published function slugs (below) and its
 * databases (`derivePodDatabasePrefix` in db_naming.ts) — so both always agree on which app a
 * source file belongs to.
 *
 * This checks shape, not access: callers resolve `sourcePath` through `DustFileSystem`, which is
 * what rejects traversal, foreign pods and scopes that are not sandbox-mounted.
 */
export function deriveAppPrefix({
  sourcePath,
  podId,
}: {
  sourcePath: string;
  podId: string;
}): Result<string | null, Error> {
  const canonicalPath = resolveCanonicalScopedPath(sourcePath, {
    conversationId: null,
    spaceId: podId,
  });
  const parsed = canonicalPath ? parseCanonicalScopedPath(canonicalPath) : null;
  if (!parsed || parsed.scope.kind !== "canonical-pod") {
    return new Err(
      new Error(
        `Path must point into the pod's file system: got '${sourcePath}'.`
      )
    );
  }

  const segments = parsed.relPath.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) {
    return new Err(
      new Error(`Path has no file component: got '${sourcePath}'.`)
    );
  }
  if (segments.length === 1) {
    return new Ok(null);
  }

  const prefix = normalizeAppPrefix(segments[0]);
  if (!prefix) {
    return new Err(
      new Error(
        `App folder '${segments[0]}' has no alphanumeric characters to derive a function prefix from.`
      )
    );
  }

  return new Ok(prefix);
}

/**
 * The bare function name inside its app, i.e. the slug with its app prefix removed. Returns the whole
 * slug for a function published from the pod root, which has no prefix.
 *
 * For display only, where the app is already the surrounding context. Everything that addresses a
 * function — `get`, `call`, `unpublish`, a Frame's reference — must keep using the full slug.
 */
export function sandboxFunctionNameFromSlug(slug: string): string {
  const separatorIndex = slug.indexOf(SANDBOX_FUNCTION_SLUG_SEPARATOR);
  if (separatorIndex <= 0) {
    return slug;
  }

  return slug.slice(separatorIndex + SANDBOX_FUNCTION_SLUG_SEPARATOR.length);
}

/**
 * Compose a published function's slug as `<appPrefix>__<name>`, where the prefix comes from the app
 * folder the source lives in: the first path segment under the pod root.
 *
 * Only that folder contributes. Folders between it and the source (the conventional `functions/`,
 * and anything nested below it) are the app's own business, so moving a source inside its app never
 * renames the published function and never orphans a Frame's `<podId>/<slug>` reference.
 *
 * A source sitting directly at the pod root has no app folder and keeps the bare name. That cannot
 * collide with an app's function: `name` is a single segment so it carries no `__`, and a prefix
 * never contains one either, so a prefixed slug always has exactly one and the two namespaces stay
 * disjoint. Moving such a source into an app folder does rename its function, which is the one
 * rename this scheme does not absorb.
 */
export function deriveSandboxFunctionSlug({
  sourcePath,
  podId,
  name,
}: {
  sourcePath: string;
  podId: string;
  name: string;
}): Result<string, Error> {
  if (!SANDBOX_FUNCTION_SLUG_SEGMENT_REGEX.test(name)) {
    return new Err(
      new Error(
        `Function name must be lowercase alphanumeric with single hyphen separators: got '${name}'.`
      )
    );
  }

  const prefixResult = deriveAppPrefix({ sourcePath, podId });
  if (prefixResult.isErr()) {
    return new Err(prefixResult.error);
  }
  const prefix = prefixResult.value;
  if (prefix === null) {
    return new Ok(name);
  }

  return new Ok(`${prefix}${SANDBOX_FUNCTION_SLUG_SEPARATOR}${name}`);
}
