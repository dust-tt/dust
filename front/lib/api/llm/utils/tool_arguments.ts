import isObject from "lodash/isObject";

import { safeParseJSON } from "@app/types";

export const parseToolArguments = (input: string): Record<string, unknown> => {
  const parsed = safeParseJSON(input);
  if (parsed.isErr()) {
    throw new Error(`Failed to parse tool call arguments: ${parsed.error}`);
  }
  if (!isObject(parsed.value) || !parsed.value) {
    throw new Error(
      `Tool call arguments must be an object and not undefined, got ${typeof parsed.value}`
    );
  }

  return parsed.value as Record<string, unknown>;
};
