// Sequelize errors (ValidationError, UniqueConstraintError, etc.) have a
// generic .message ("Validation error") but carry field-level detail in
// .errors[]. This helper extracts that detail for structured logging.
export function getSequelizeErrorDetails(error: Error) {
  if (
    error.name.startsWith("Sequelize") &&
    "errors" in error &&
    Array.isArray(error.errors)
  ) {
    return error.errors.map(
      (e: { message?: string; type?: string; path?: string }) => ({
        message: e.message,
        type: e.type,
        path: e.path,
      })
    );
  }
  return undefined;
}
