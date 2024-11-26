/**
 * Errors returned by the library node-zendesk.
 * Check out https://github.com/blakmatrix/node-zendesk/blob/fa069d927bd418ee2058bb7bb913f9414e395110/src/clients/helpers.js#L262
 */
interface NodeZendeskError extends Error {
  statusCode: number;
  result: string | null;
}

export function isNodeZendeskForbiddenError(
  err: unknown
): err is NodeZendeskError {
  return (
    typeof err === "object" &&
    err !== null &&
    "statusCode" in err &&
    err.statusCode === 403
  );
}
