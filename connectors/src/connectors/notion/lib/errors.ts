const NOTION_UNHEALTHY_ERROR_CODES = [
  "internal_server_error",
  "notionhq_client_request_timeout",
  "service_unavailable",
  "notionhq_client_response_error",
];

export function isUnhealthyNotionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (("code" in error &&
      typeof error.code === "string" &&
      NOTION_UNHEALTHY_ERROR_CODES.includes(error.code)) ||
      ("status" in error &&
        typeof error.status === "number" &&
        error.status >= 500 &&
        error.status < 600))
  );
}
