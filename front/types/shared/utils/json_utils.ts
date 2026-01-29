import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export function safeParseJSON(str: string): Result<object | null, Error> {
  try {
    const res = JSON.parse(str);

    return new Ok(res);
  } catch (err) {
    if (err instanceof Error) {
      return new Err(err);
    }

    return new Err(new Error("Unexpected error: JSON parsing failed."));
  }
}
