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
function podDatabasePrefixFromAppPrefix(
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
 * The app prefix (function-slug form) an on-disk database name belongs to, or `null` for a database
 * with no app prefix — either created before namespacing, or owned by an app whose name cannot start
 * a database name (see `podDatabasePrefixFromAppPrefix`).
 *
 * The inverse of `podDatabasePrefixFromAppPrefix`, which is injective because `deriveAppPrefix`
 * never emits an underscore, so every underscore here came from a hyphen.
 */
export function appPrefixFromPodDatabaseName(name: string): string | null {
  const separatorIndex = name.indexOf(POD_DATABASE_PREFIX_SEPARATOR);
  if (separatorIndex <= 0) {
    return null;
  }

  return name.slice(0, separatorIndex).replace(/_/g, "-");
}

/**
 * A database's app-relative name, i.e. the on-disk name with its app prefix removed. This is the name
 * the schema file declares and `db()` opens, so it is also the right thing to show inside an app.
 * Returns the whole name for a database with no app prefix.
 */
export function podDatabaseNameWithoutAppPrefix(name: string): string {
  const separatorIndex = name.indexOf(POD_DATABASE_PREFIX_SEPARATOR);
  if (separatorIndex <= 0) {
    return name;
  }

  return name.slice(separatorIndex + POD_DATABASE_PREFIX_SEPARATOR.length);
}

/**
 * Pick the database file `name` refers to, given the names currently on disk.
 *
 * `name` is the database's app-relative name as the schema file declares it (`chat`). An
 * already-qualified name is accepted too and re-qualified to itself, because `db_list` reports
 * on-disk names and a model may well copy `myapp__chat` from it straight into `db_reconcile`.
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
 *
 * A prefix that would push the qualified name past the name contract's 64-character cap yields the
 * bare name instead of an error, which keeps this total: reconcile and the runtime always agree
 * without either having to handle a failure.
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
  if (prefix === null) {
    return name;
  }
  const appRelativeName = name.startsWith(prefix)
    ? name.slice(prefix.length)
    : name;
  const qualified = `${prefix}${appRelativeName}`;
  if (!POD_DATABASE_NAME_REGEX.test(qualified)) {
    return appRelativeName;
  }

  const existing = new Set(existingNames);
  if (existing.has(qualified)) {
    return qualified;
  }
  return existing.has(appRelativeName) ? appRelativeName : qualified;
}
