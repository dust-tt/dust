import type { z } from "zod";

import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export async function validateJiraApiResponse<T extends z.ZodTypeAny>(
  response: Response,
  schema: T
): Promise<Result<z.infer<T>, Error>> {
  if (!response.ok) {
    const errorText = await response.text();
    return new Err(
      new Error(`API request failed: ${response.statusText} - ${errorText}`)
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    return new Err(
      new Error(
        `Failed to parse JSON response: ${normalizeError(error).message}`
      )
    );
  }

  const parseResult = schema.safeParse(data);
  if (!parseResult.success) {
    return new Err(
      new Error(
        `API response validation failed: ${parseResult.error.message}. Response: ${JSON.stringify(data)}`
      )
    );
  }

  return new Ok(parseResult.data);
}
