/**
 * Errors returned by the library node-zendesk.
 * Check out https://github.com/blakmatrix/node-zendesk/blob/fa069d927bd418ee2058bb7bb913f9414e395110/src/clients/helpers.js#L262
 */
interface NodeZendeskError extends Error {
  statusCode: number;
  result: string | null;
}

interface ZendeskApiError extends Error {
  status: number;
  description: string | null;
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

export function isZendeskExpiredCursorError(
  err: unknown
): err is ZendeskApiError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    err.status === 422 &&
    "description" in err &&
    typeof err.description === "string" &&
    err.description.includes("Invalid search: cursor has expired")
  );
}

export function isZendeskEpipeError(err: unknown): err is NodeZendeskError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "EPIPE"
  );
}
