export type ErrorType =
  | "invalid_request_error"
  | "internal_server_error"
  | "bad_request"
  | "data_source_error"
  | "data_source_not_found"
  | "missing_authorization_header_error"
  | "malformed_authorization_header_error"
  | "invalid_api_key_error";

type _ApiError = {
  type: ErrorType;
  message: string;
  data_source_error?: object;
};

/**
 * This is the type of the error object returned by the API.
 */
export type ApiError = {
  error: _ApiError;
};

export type ApiDocument = {
  created: number;
  document_id: string;
  timestamp: number;
  tags: Array<string>;
  hash: string;
  text_size: number;
  chunk_count: number;
  chunks: Array<{
    text: string;
    hash: string;
    offset: number;
    vector: Array<number> | null;
    score: number | null;
  }>;
};
