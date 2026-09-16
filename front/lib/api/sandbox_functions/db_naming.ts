/**
 * Reading the app-namespaced database names Pod functions left behind.
 *
 * A pod's databases live in one flat directory, `{name}.db` files replicated to GCS by litestream
 * under a prefix keyed on that filename. An app's databases were namespaced by prefixing the FILE
 * name (`myapp__chat.db`), never by nesting them in a per-app subdirectory: subdirectories would
 * have made two apps' `chat.db` share one replica prefix.
 *
 * Nothing writes a prefix any more. The prefix came from the app folder a Pod function's source
 * lived in, derived from its slug at invocation time; Frame functions carry no app prefix, front
 * passes no `DUST_POD_DATABASE_PREFIX`, and `resolveDatabasePath` in cli/dust-sandbox/pod/db.ts
 * falls back to the bare filename when no prefixed file exists. What remains is reading the names
 * already on disk, which is what `copy_pod_databases_to_frame.ts` does when moving them to a Frame.
 */

/** The separator between an app prefix and a database name, in the names the old scheme wrote. */
const POD_DATABASE_PREFIX_SEPARATOR = "__";

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
