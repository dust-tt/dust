import { RequestError } from "octokit";

export function isGithubRequestErrorNotFound(error: unknown): error is {
  name: string;
  status: number;
  message: string;
} {
  return (
    error instanceof Error &&
    "name" in error &&
    error.name === "HttpError" &&
    "status" in error &&
    error.status === 404
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
