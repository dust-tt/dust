import isObject from "lodash/isObject";

import { safeParseJSON } from "@app/types";

export const parseToolArguments = (
  input: string,
  toolName: string
): Record<string, unknown> => {
  if (input.trim() === "") {
    return {};
  }
  const parsed = safeParseJSON(input);
  if (parsed.isErr()) {
    throw new Error(
      `Failed to parse arguments in call to tool '${toolName}': ${parsed.error}`
    );
  }
  if (!isObject(parsed.value) || !parsed.value) {
    throw new Error(
      `Tool call arguments must be an object and not undefined, got ${typeof parsed.value}. Tool is '${toolName}'.`
    );
  }

  return parsed.value as Record<string, unknown>;
};
