export type APIError = {
  type: string;
  message: string;
  connectors_error?: unknown;
};

export type APIErrorResponse = {
  error: APIError;
};

export function isAPIErrorResponse(obj: unknown): obj is APIErrorResponse {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "error" in obj &&
    typeof (obj as { error: unknown }).error === "object" &&
    (obj as { error: unknown }).error !== null &&
    "type" in (obj as { error: { type: unknown } }).error &&
    "message" in (obj as { error: { message: unknown } }).error
  );
}
