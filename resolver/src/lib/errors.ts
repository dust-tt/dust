export type APIErrorType = "internal_server_error"
  | "invalid_request_error"

export type APIError = {
  type: APIErrorType;
  message: string;
}

export type APIErrorWithStatusCode = {
  api_error: APIError;
  status_code: number;
};
export type APIErrorResponse = {
  error: APIError;
};

export type WithAPIErrorResponse<T> = T | APIErrorResponse;
