import { RequestError } from "octokit";

export function isGithubRequestErrorNotFound(
  error: unknown
): error is RequestError {
  return error instanceof RequestError && error.status === 404;
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
