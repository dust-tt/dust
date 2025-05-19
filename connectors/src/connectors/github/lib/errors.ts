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
