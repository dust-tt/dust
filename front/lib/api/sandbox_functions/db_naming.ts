import { SANDBOX_FUNCTION_SLUG_SEPARATOR } from "@app/lib/api/sandbox_functions/slug";

/**
 * App namespacing for the databases of legacy Pod functions.
 *
 * A pod's databases live in one flat directory, `{name}.db` files replicated to GCS by litestream
 * under a prefix keyed on that filename. So an app's databases were namespaced by prefixing the
 * FILE name (`myapp__chat.db`), never by nesting them in a per-app subdirectory: subdirectories
 * would make two apps' `chat.db` share one replica prefix.
 *
 * Nothing publishes Pod functions any more; this is what the pod-to-Frame database copy script
 * needs to read those names back. Frame databases are unprefixed.
 */

/** The separator between an app prefix and a database name; shared with function slugs. */
const POD_DATABASE_PREFIX_SEPARATOR = SANDBOX_FUNCTION_SLUG_SEPARATOR;

/**
 * A database's app-relative name, i.e. the on-disk name with its app prefix removed. This is the
 * name the schema file declares and `db()` opens. Returns the whole name for a database with no
 * app prefix.
 */
export function podDatabaseNameWithoutAppPrefix(name: string): string {
  const separatorIndex = name.indexOf(POD_DATABASE_PREFIX_SEPARATOR);
  if (separatorIndex <= 0) {
    return name;
  }

  return name.slice(separatorIndex + POD_DATABASE_PREFIX_SEPARATOR.length);
}
