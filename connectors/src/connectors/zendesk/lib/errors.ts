/**
 * Errors returned by the library node-zendesk.
 * Check out https://github.com/blakmatrix/node-zendesk/blob/fa069d927bd418ee2058bb7bb913f9414e395110/src/clients/helpers.js#L262
 */
interface NodeZendeskError extends Error {
  statusCode: number;
  result: string | null;
}

export class ZendeskApiError extends Error {
  readonly status?: number;
  readonly data?: object;

  constructor(message: string, status: number, data?: object) {
    super(message);
    this.status = status;
    this.data = data;
  }
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

export function isZendeskForbiddenError(err: unknown): err is ZendeskApiError {
  return err instanceof ZendeskApiError && err.status === 403;
}

export function isZendeskExpiredCursorError(
  err: unknown
): err is ZendeskApiError {
  return (
    err instanceof ZendeskApiError &&
    err.status === 422 &&
    !!err.data &&
    "description" in err.data &&
    typeof err.data.description === "string" &&
    err.data.description.includes("Invalid search: cursor has expired")
  );
}

/**
 * Catches 404 errors that were already caught in fetchFromZendeskWithRetries and rethrown as ZendeskApiErrors.
 * The idea is that we only try/catch the part where we call the API, without wrapping any of our code and from then
 * only certain functions can actually handle 404 by returning a null.
 */
export function isZendeskNotFoundError(
  err: unknown
): err is ZendeskApiError & boolean {
  return err instanceof ZendeskApiError && err.status === 404;
}

export function isNodeZendeskEpipeError(err: unknown): err is NodeZendeskError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "EPIPE"
  );
}
