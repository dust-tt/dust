import { Err, Ok, Result } from "@app/lib/result";
import logger from "@app/logger/logger";
import Ajv, { JSONSchemaType } from "ajv";

const ajv = new Ajv({
  coerceTypes: true,
});

export class RequestParseError extends Error {}

export async function* streamChunks(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      yield value;
    }
  } catch (e) {
    logger.error(
      {
        error: e,
      },
      "Error streaming chunks"
    );
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a request body into a typed object
 * @param schema
 * @param data
 * @returns Result<SchemaType, Error> Ok(data) or Err(Error)
 */
export function parse_payload<SchemaType>(
  schema: JSONSchemaType<SchemaType>,
  data: any
): Result<SchemaType, Error> {
  const validate = ajv.compile(schema);
  if (validate(data)) {
    return new Ok(data);
  }

  return new Err(
    new RequestParseError(validate.errors?.map((e) => e.message).join(", "))
  );
}
