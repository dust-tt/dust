import {
  deriveAppPrefix,
  SANDBOX_FUNCTION_SLUG_SEPARATOR,
} from "@app/lib/api/sandbox_functions/slug";
import { POD_DATABASE_NAME_REGEX } from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * App namespacing for pod databases.
 *
 * A pod's databases live in one flat directory, `{name}.db` files replicated to GCS by litestream
 * under a prefix keyed on that filename. So an app's databases are namespaced by prefixing the
 * FILE name (`myapp__chat.db`), never by nesting them in a per-app subdirectory: subdirectories
 * would make two apps' `chat.db` share one replica prefix.
 *
 * The app prefix is never written in the function's source. Source code says `db("chat")`, and the
 * prefix is derived from where the code lives — the schema file's app folder when reconciling, the
 * function's slug when invoking. That is what makes an app folder copyable inside a pod: the copy
 * publishes under its own prefix and so gets its own databases, with no source edit.
 *
 * Databases created before app namespacing existed keep their bare filenames. Both resolution
 * paths (`resolvePodDatabaseName` here, `resolveDatabasePath` in cli/dust-sandbox/pod/db.ts) prefer
 * the prefixed file when it exists and fall back to the bare one, so those keep working untouched.
 */

/** The separator between an app prefix and a database name; shared with function slugs. */
const POD_DATABASE_PREFIX_SEPARATOR = SANDBOX_FUNCTION_SLUG_SEPARATOR;

/**
 * Convert an app prefix (function-slug form, hyphen-separated) into a pod database prefix,
 * separator included: `my-app` becomes `my_app__`.
 *
 * Hyphens become underscores because database names admit `[a-z0-9_]` only, while slug segments use
 * hyphens. The mapping is injective over the prefixes `deriveAppPrefix` can produce, since it never
 * emits an underscore — so two apps can never normalize onto the same database prefix.
 *
 * Returns `null` when the app name cannot start a database name (the contract requires a leading
 * letter, but a folder like `2048Game` normalizes to `2048game`). Such an app falls back to
 * unprefixed database names, which is how every pod behaved before namespacing — deliberately not
 * an error, since refusing would leave the app unable to create any database at all.
 */
export function podDatabasePrefixFromAppPrefix(
  appPrefix: string | null
): string | null {
  if (appPrefix === null) {
    return null;
  }
  const normalized = appPrefix.replace(/-/g, "_");
  if (!/^[a-z]/.test(normalized)) {
    return null;
  }
  return `${normalized}${POD_DATABASE_PREFIX_SEPARATOR}`;
}

/**
 * The database prefix for a published function, derived from its slug's app segment. Used at
 * invocation time, where the slug is all the app identity front has — the source path is not
 * involved in running a published bundle.
 */
export function podDatabasePrefixFromSlug(slug: string): string | null {
  const separatorIndex = slug.indexOf(POD_DATABASE_PREFIX_SEPARATOR);
  if (separatorIndex <= 0) {
    return null;
  }
  return podDatabasePrefixFromAppPrefix(slug.slice(0, separatorIndex));
}

/**
 * The database prefix for a source file in the pod, derived from its app folder. Used when
 * reconciling, where the schema file's path is what identifies the app.
 */
export function podDatabasePrefixFromPodPath({
  sourcePath,
  podId,
}: {
  sourcePath: string;
  podId: string;
}): Result<string | null, Error> {
  const appPrefixResult = deriveAppPrefix({ sourcePath, podId });
  if (appPrefixResult.isErr()) {
    return new Err(appPrefixResult.error);
  }
  return new Ok(podDatabasePrefixFromAppPrefix(appPrefixResult.value));
}

/**
 * Qualify an app-relative database name with its app prefix, or return it unchanged when there is
 * no prefix or the result would break the name contract (a long app folder plus a long database
 * name can exceed the 64-character cap). Falling back rather than erroring keeps this total, so
 * reconcile and the runtime always agree on the name without either having to handle a failure.
 */
export function qualifyPodDatabaseName({
  prefix,
  name,
}: {
  prefix: string | null;
  name: string;
}): string {
  if (prefix === null) {
    return name;
  }
  const qualified = `${prefix}${name}`;
  return POD_DATABASE_NAME_REGEX.test(qualified) ? qualified : name;
}

/**
 * Strip an app prefix the caller already applied, so qualifying is idempotent. `db_list` reports
 * on-disk names, so a model that copies `myapp__chat` from it into `db_reconcile` must not end up
 * reconciling `myapp__myapp__chat`.
 */
export function stripPodDatabasePrefix({
  prefix,
  name,
}: {
  prefix: string | null;
  name: string;
}): string {
  if (prefix !== null && name.startsWith(prefix)) {
    return name.slice(prefix.length);
  }
  return name;
}

/**
 * Pick the database file an app-relative `name` refers to, given the names currently on disk.
 *
 * Mirrors `resolveDatabasePath` in cli/dust-sandbox/pod/db.ts so reconcile applies schema changes
 * to exactly the file `db()` will open:
 *
 * 1. the app-prefixed name when that database already exists — an app that has been namespaced
 *    stays namespaced;
 * 2. otherwise the bare name when THAT database already exists — the transitional case, covering
 *    databases created before namespacing;
 * 3. otherwise the app-prefixed name, creating it — every new database is namespaced.
 *
 * The step 2 fallback is temporary. While it stands, two apps that each reconcile a name which
 * already exists unprefixed keep sharing that one legacy database, exactly as they do today;
 * removing the fallback requires renaming those files and their litestream replica prefixes.
 */
export function resolvePodDatabaseName({
  prefix,
  name,
  existingNames,
}: {
  prefix: string | null;
  name: string;
  existingNames: string[];
}): string {
  const qualified = qualifyPodDatabaseName({ prefix, name });
  if (qualified === name) {
    return name;
  }
  const existing = new Set(existingNames);
  if (existing.has(qualified)) {
    return qualified;
  }
  return existing.has(name) ? name : qualified;
}
