import { Err, Ok, Result } from "@dust-tt/types";
import Ajv, { JSONSchemaType } from "ajv";

const ajv = new Ajv({
  coerceTypes: true,
});

export class RequestParseError extends Error {}

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
