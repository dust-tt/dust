export type APIErrorType = "internal_server_error";

export type APIError = {
  type: APIErrorType;
  message: string;
};

export type APIErrorWithStatusCode = {
  api_error: APIError;
  status_code: number;
};
