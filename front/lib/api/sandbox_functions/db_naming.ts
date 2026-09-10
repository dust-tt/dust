import { SANDBOX_FUNCTION_SLUG_SEPARATOR } from "@app/lib/api/sandbox_functions/slug";

/**
 * App namespacing for pod databases.
 *
 * A pod's databases live in one flat directory, `{name}.db` files replicated to GCS by litestream
 * under a prefix keyed on that filename. So an app's databases are namespaced by prefixing the
 * FILE name (`myapp__chat.db`), never by nesting them in a per-app subdirectory: subdirectories
 * would make two apps' `chat.db` share one replica prefix.
 *
 * The app prefix is never written in the function's source. Source code says `db("chat")`, and the
 * prefix is derived from the function's slug when invoking. That is what makes an app folder copyable inside a pod: the copy
 * publishes under its own prefix and so gets its own databases, with no source edit.
 *
 * Databases created before app namespacing existed keep their bare filenames;
 * `resolveDatabasePath` in cli/dust-sandbox/pod/db.ts prefers the prefixed file when it exists and
 * falls back to the bare one, so those keep working untouched.
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
