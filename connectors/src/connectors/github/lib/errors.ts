import { normalizeError } from "@connectors/types/api";
import { GraphqlResponseError } from "@octokit/graphql";
import { RequestError } from "octokit";

export function isGithubRequestErrorNotFound(
  error: unknown
): error is RequestError {
  return error instanceof RequestError && error.status === 404;
}
export function isGithubRequestErrorRepositoryAccessBlocked(
  error: unknown
): error is RequestError {
  return (
    error instanceof RequestError &&
    error.status === 451 &&
    error.message.includes("Repository access blocked")
  );
}
export function isGithubRequestRedirectCountExceededError(
  error: unknown
): error is RequestError {
  return (
    error instanceof RequestError &&
    error.status === 500 &&
    error.message.includes("redirect count exceeded")
  );
}

export function isBadCredentials(error: unknown): error is RequestError {
  return (
    error instanceof RequestError &&
    error.status === 401 &&
    error.message.includes("Bad credentials")
  );
}

export function isGithubIssueWasDeletedError(
  error: unknown
): error is RequestError {
  return (
    error instanceof RequestError &&
    error.status === 410 &&
    error.message.includes("This issue was deleted")
  );
}

export function isGithubIssueWasDisabledError(
  error: unknown
): error is RequestError {
  return (
    error instanceof RequestError &&
    error.status === 410 &&
    error.message.includes("Issues are disabled for this repo")
  );
}

export function isGraphQLNotFound(error: unknown): error is Error {
  return (
    error instanceof Error &&
    "errors" in error &&
    Array.isArray(error.errors) &&
    error.errors.some((e) => e.type === "NOT_FOUND")
  );
}

export class RepositoryAccessBlockedError extends Error {
  constructor(readonly innerError?: RequestError) {
    super(innerError?.message);
    this.name = "RepositoryAccessBlockedError";
  }
}

export class RepositoryNotFoundError extends Error {
  constructor(readonly innerError?: RequestError) {
    super(innerError?.message || "Repository not found");
    this.name = "RepositoryNotFoundError";
  }
}

export function isGraphQLRepositoryNotFound(
  error: unknown
): error is GraphqlResponseError<unknown> {
  if (!(error instanceof GraphqlResponseError)) {
    return false;
  }

  if (!error.errors || !Array.isArray(error.errors)) {
    return false;
  }

  return error.errors.some((e) => {
    const normalizedError = normalizeError(e);
    return (
      "type" in e &&
      e.type === "NOT_FOUND" &&
      normalizedError.message.includes("Could not resolve to a Repository")
    );
  });
}

/**
 * Checks if an error is a transient network error that should be retried.
 * These are typically connection issues, timeouts, or stream terminations.
 */
export function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const transientMessages = [
    "terminated", // undici fetch stream termination
    "ECONNRESET",
    "ETIMEDOUT",
    "socket hang up",
    "other side closed",
    "network socket disconnected",
  ];

  return transientMessages.some((msg) =>
    error.message.toLowerCase().includes(msg.toLowerCase())
  );
}

const MAX_ERROR_CAUSE_DEPTH = 5;

interface GithubErrorDetails {
  errorCauses: string[];
  errorCode: string | null;
  errorMessage: string;
  errorName: string;
  githubRateLimitRemaining: string | number | null;
  githubRequestId: string | number | null;
  githubRetryAfter: string | number | null;
  githubStatus: number | null;
  isTransient: boolean;
}

function getErrorCode(error: Error): string | null {
  return "code" in error && typeof error.code === "string" ? error.code : null;
}

export function describeGithubError(error: unknown): GithubErrorDetails {
  const normalizedError = normalizeError(error);

  const errorCauses: string[] = [];
  let cause: unknown = normalizedError.cause;
  while (cause instanceof Error && errorCauses.length < MAX_ERROR_CAUSE_DEPTH) {
    const causeCode = getErrorCode(cause);
    errorCauses.push(
      `${cause.name}: ${cause.message}${causeCode ? ` (${causeCode})` : ""}`
    );
    cause = cause.cause;
  }

  const headers =
    error instanceof RequestError ? error.response?.headers : undefined;

  return {
    errorCauses,
    errorCode: getErrorCode(normalizedError),
    errorMessage: normalizedError.message,
    errorName: normalizedError.name,
    githubRateLimitRemaining: headers?.["x-ratelimit-remaining"] ?? null,
    githubRequestId: headers?.["x-github-request-id"] ?? null,
    githubRetryAfter: headers?.["retry-after"] ?? null,
    githubStatus: error instanceof RequestError ? error.status : null,
    isTransient: isTransientNetworkError(error),
  };
}
