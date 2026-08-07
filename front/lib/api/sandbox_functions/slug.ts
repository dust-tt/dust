import {
  parseCanonicalScopedPath,
  resolveCanonicalScopedPath,
} from "@app/lib/api/files/mount_path";
import { SANDBOX_FUNCTION_SLUG_SEGMENT_REGEX } from "@app/types/api/sandbox_functions";
import { Err, Ok, type Result } from "@app/types/shared/result";

export const SANDBOX_FUNCTION_SLUG_SEPARATOR = "__";

/**
 * Normalize an app folder name into one slug segment: lowercase, every run of characters outside
 * `[a-z0-9]` collapsed to a hyphen, no leading or trailing hyphen. Deliberately no camel-case
 * splitting, so `TaskList` becomes `tasklist` rather than `task-list`: a predictable rule beats a
 * prettier heuristic that has to decide what to do with `MyAPIApp`.
 */
function normalizeAppPrefix(folderName: string): string {
  return folderName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
 *
 * This checks shape, not access: callers resolve `sourcePath` through `DustFileSystem`, which is
 * what rejects traversal, foreign pods and scopes that are not sandbox-mounted.
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
    return new Ok(name);
  }

  const prefix = normalizeAppPrefix(segments[0]);
  if (!prefix) {
    return new Err(
      new Error(
        `App folder '${segments[0]}' has no alphanumeric characters to derive a function prefix from.`
      )
    );
  }

  return new Ok(`${prefix}${SANDBOX_FUNCTION_SLUG_SEPARATOR}${name}`);
}
