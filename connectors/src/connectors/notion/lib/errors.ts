// This type is a simplified abstraction and

import { APIErrorCode } from "@notionhq/client";
const APIErrorCodeValues = Object.values(APIErrorCode);

// Does not fully represent the structure of errors returned by the Notion API.
interface NotionError extends Error {
  body: unknown;
  code: APIErrorCode;
  status: number;
}

export function isNotionError(error: unknown): error is NotionError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    APIErrorCodeValues.includes((error as NotionError).code)
  );
}
