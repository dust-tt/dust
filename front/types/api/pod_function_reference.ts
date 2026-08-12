import { SCOPED_PREFIX_POD } from "@app/lib/api/file_system/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * The reference a Frame passes to `usePodFunction`, and how a relative one resolves.
 *
 * **Absolute** — `<podId>/<slug>`. Works from any Frame, including conversation Frames, and is the
 * only form that can name a function in another Pod. Unchanged, and still what a Frame outside an app
 * folder must use.
 *
 * **Relative** — a bare `<name>` with no `/`. Resolves against the app folder the calling Frame lives
 * in, so `list-notes` inside `pod-x/TaskList/TaskList.tsx` means `pod-x/tasklist__list-notes`. This is
 * what makes an app copyable and renamable: the Frame's source says nothing about which app it belongs
 * to, so the same reference follows the folder it ends up in, instead of silently continuing to call
 * the original app's functions.
 *
 * The two forms are unambiguous by construction: absolute always contains `/`, relative never does. A
 * prefixed-but-podless `tasklist__list-notes` is deliberately NOT a relative reference — dropping the
 * prefix is the entire point, and accepting a third form would just be another thing to reason about.
 *
 * Resolution happens in the host that renders the Frame, because that is the only layer that both
 * knows which Frame is calling and is trusted about it: the Frame itself does not know its own path,
 * and the invocation request carries no Frame identity. This module is the shared contract so the host
 * and front's own path derivation compute the same prefix from the same folder name.
 *
 * (`@app/lib/api/file_system/types` is import-free, so importing it here keeps this module safe to
 * pull into the browser bundle.)
 */

/** One slug segment: lowercase alphanumeric with single hyphen separators, e.g. `list-notes`. */
const SLUG_SEGMENT_PATTERN = "[a-z0-9]+(?:-[a-z0-9]+)*";

/** A relative reference is exactly one slug segment, with no `/` and no `__` app prefix. */
export const POD_FUNCTION_RELATIVE_REFERENCE_REGEX = new RegExp(
  `^${SLUG_SEGMENT_PATTERN}$`
);

/** The app folder a Frame lives in, as the host knows it. */
export type PodFunctionScope = {
  podId: string;
  appPrefix: string;
};

/**
 * Normalize an app folder name into one slug segment: lowercase, every run of characters outside
 * `[a-z0-9]` collapsed to a hyphen, no leading or trailing hyphen. Deliberately no camel-case
 * splitting, so `TaskList` becomes `tasklist` rather than `task-list`: a predictable rule beats a
 * prettier heuristic that has to decide what to do with `MyAPIApp`.
 *
 * The single authority for turning a folder name into an app prefix, shared by publish (through
 * `deriveAppPrefix`), pod database naming, and the host's reference resolution. If these ever
 * disagreed, a Frame would resolve to a function that does not exist.
 */
export function normalizeAppPrefix(folderName: string): string {
  return folderName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Whether `reference` is the relative form, i.e. resolvable only against an app folder. */
export function isRelativePodFunctionReference(reference: string): boolean {
  return POD_FUNCTION_RELATIVE_REFERENCE_REGEX.test(reference);
}

/**
 * The scope a Frame at `framePath` calls functions in, or null when it has no app folder to resolve
 * against — a Frame at the Pod root, or any path that is not a Pod scoped path at all.
 *
 * `framePath` is a canonical scoped path, e.g. `pod-{podId}/TaskList/TaskList.tsx`. A Frame must sit
 * at least one folder deep for that folder to be its app.
 */
export function podFunctionScopeFromFramePath(
  framePath: string | null | undefined
): PodFunctionScope | null {
  if (!framePath || !framePath.startsWith(SCOPED_PREFIX_POD)) {
    return null;
  }

  const [podScope, ...rest] = framePath.split("/");
  const podId = podScope.slice(SCOPED_PREFIX_POD.length);
  if (!podId) {
    return null;
  }

  const segments = rest.filter((segment) => segment.length > 0);
  // Fewer than two segments means the Frame file sits directly at the Pod root, so it owns no app.
  if (segments.length < 2) {
    return null;
  }

  const appPrefix = normalizeAppPrefix(segments[0]);
  if (!appPrefix) {
    return null;
  }

  return { podId, appPrefix };
}

/**
 * Qualify a Frame's function reference for invocation.
 *
 * Absolute references pass through untouched. A relative one is expanded against `scope`, and refused
 * when the Frame has none — which is what confines relative references to Frames that live in an app
 * folder. Anything that is neither form is refused rather than forwarded, so a malformed reference
 * fails loudly instead of reaching the API as a nonsense slug.
 */
export function resolvePodFunctionReference(
  reference: string,
  scope: PodFunctionScope | null
): Result<string, Error> {
  if (reference.includes("/")) {
    return new Ok(reference);
  }

  if (!isRelativePodFunctionReference(reference)) {
    return new Err(
      new Error(
        `'${reference}' is not a pod function reference: expected '<podId>/<slug>', ` +
          "or a bare function name inside an app folder."
      )
    );
  }

  if (!scope) {
    return new Err(
      new Error(
        `Cannot resolve '${reference}': a bare function name only works from a Frame that lives ` +
          "in an app folder. Use the fully qualified '<podId>/<slug>' reference instead."
      )
    );
  }

  return new Ok(`${scope.podId}/${scope.appPrefix}__${reference}`);
}
