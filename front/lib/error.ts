import { NextApiResponse } from "next";

import logger from "@app/logger/logger";

export type InternalErrorWithStatusCode = {
  status_code: number;
};

export type APIErrorType =
  | "missing_authorization_header_error"
  | "malformed_authorization_header_error"
  | "invalid_api_key_error"
  | "internal_server_error"
  | "data_source_not_found"
  | "invalid_request_error"
  | "data_source_error"
  | "user_not_found"
  | "data_source_auth_error"
  | "data_source_quota_error"
  | "data_source_document_not_found"
  | "run_error"
  | "app_not_found"
  | "app_auth_error"
  | "dataset_not_found"
  | "method_not_supported_error"
  | "personal_workspace_not_found";

export type APIError = {
  type: APIErrorType;
  message: string;
  data_source_error?: object;
  run_error?: object;
  app_error?: object;
};

export type ReturnedAPIErrorType = {
  error: APIError;
};

/**
 * Type to transport a HTTP error with its http status code (eg: 404)
 * and the error object returned by our public API endpoints (api/v1/*)
 */
export type APIErrorWithStatusCode = {
  api_error: APIError;
  status_code: number;
};
