export class ZendeskApiError extends Error {
  readonly status?: number;
  readonly data?: object;

  constructor(message: string, status: number, data?: object) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function isZendesk401WithError(
  err: ZendeskApiError,
  errorMessage: string
): boolean {
  return (
    err.status === 401 &&
    typeof err.data === "object" &&
    err.data !== null &&
    "response" in err.data &&
    typeof err.data.response === "object" &&
    err.data.response !== null &&
    "error" in err.data.response &&
    err.data.response.error === errorMessage
  );
}

export function isZendeskForbiddenError(err: unknown): err is ZendeskApiError {
  return (
    err instanceof ZendeskApiError &&
    (err.status === 403 ||
      isZendesk401WithError(err, "invalid_token") ||
      isZendesk401WithError(err, "Couldn't authenticate you"))
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
