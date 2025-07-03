/**
 * Checks if an error is a BigQuery permissions error (403 Access Denied)
 */
export function isBigqueryPermissionsError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 403 &&
    "errors" in error &&
    Array.isArray(error.errors) &&
    error.errors.some((e) => e?.reason === "accessDenied")
  );
}
