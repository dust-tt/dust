export type ErrorType =
  | "invalid_request_error"
  | "internal_server_error"
  | "bad_request"
  | "data_source_error"
  | "data_source_not_found"
  | "missing_authorization_header_error"
  | "malformed_authorization_header_error"
  | "invalid_api_key_error";

type _HTTPError = {
  type: ErrorType;
  message: string;
  data_source_error?: object;
};

export type HTTPError = {
  status_code: number;
  error: _HTTPError;
};
