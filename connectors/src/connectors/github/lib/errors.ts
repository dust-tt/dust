import { GraphqlResponseError } from "@octokit/graphql";
import { RequestError } from "octokit";

import { normalizeError } from "@connectors/types/api";

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
