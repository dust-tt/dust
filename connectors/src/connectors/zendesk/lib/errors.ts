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

export function isZendeskEpipeError(err: unknown): err is NodeZendeskError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "EPIPE"
  );
}
