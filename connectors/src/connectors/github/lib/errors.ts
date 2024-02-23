import { RequestError } from "octokit";

export function isGithubRequestErrorNotFound(
  error: unknown
): error is RequestError {
  return error instanceof RequestError && error.status === 404;
}
