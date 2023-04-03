export type APIErrorType =
  | "missing_authorization_header_error"
  | "malformed_authorization_header_error"
  | "invalid_api_key_error"
  | "internal_server_error";

type _APIError = {
  type: APIErrorType;
  message: string;
  data_source_error?: object;
};

export type APIError = {
  status_code: number;
  error: _APIError;
};
