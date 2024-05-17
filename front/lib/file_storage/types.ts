export class GCSAPIError {
  code?: number;
}

function isGCSApiError(error: unknown): error is GCSAPIError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "number"
  );
}

export function isGCSNotFoundError(error: unknown): error is GCSAPIError {
  return isGCSApiError(error) && error.code === 404;
}
