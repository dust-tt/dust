import type { MatcherExpression, OperationExpression } from "@app/lib/matcher";
import { isLogicalExpression, parseMatcherExpression } from "@app/lib/matcher";
import { isJSONSchemaObject } from "@app/lib/utils/json_schemas";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  JSONSchema7 as JSONSchema,
  JSONSchema7TypeName as JSONSchemaTypeName,
} from "json-schema";

type ResolvedFieldSchema = {
  fieldTypes: Set<JSONSchemaTypeName>;
  valueSchema: JSONSchema | null;
};

function getSchemaTypes(schema: JSONSchema | null): Set<JSONSchemaTypeName> {
  if (!schema) {
    return new Set();
  }
  if (Array.isArray(schema.type)) {
    return new Set(schema.type);
  }
  if (schema.type) {
    return new Set([schema.type]);
  }
  if (schema.properties) {
    return new Set(["object"]);
  }
  if (schema.items) {
    return new Set(["array"]);
  }
  return new Set();
}

function resolveFieldSchema(
  rootSchema: JSONSchema,
  field: string
): Result<ResolvedFieldSchema, Error> {
  const path = field.split(".");
  const wildcardCount = path.filter((segment) => segment === "*").length;
  if (wildcardCount > 1) {
    return new Err(new Error(`Field "${field}" uses more than one wildcard.`));
  }
  if (path.at(-1) === "*") {
    return new Err(
      new Error(`Field "${field}" must select a property after its wildcard.`)
    );
  }

  let currentSchema = rootSchema;
  let usesWildcard = false;

  for (const segment of path) {
    if (segment === "*") {
      const items = currentSchema.items;
      if (
        !getSchemaTypes(currentSchema).has("array") ||
        Array.isArray(items) ||
        !isJSONSchemaObject(items)
      ) {
        return new Err(
          new Error(`Field "${field}" does not exist in the event schema.`)
        );
      }
      currentSchema = items;
      usesWildcard = true;
      continue;
    }

    const property = currentSchema.properties?.[segment];
    if (!isJSONSchemaObject(property)) {
      return new Err(
        new Error(`Field "${field}" does not exist in the event schema.`)
      );
    }
    currentSchema = property;
  }

  if (usesWildcard) {
    return new Ok({
      fieldTypes: new Set(["array"]),
      valueSchema: currentSchema,
    });
  }

  const fieldTypes = getSchemaTypes(currentSchema);
  const items = currentSchema.items;
  let valueSchema: JSONSchema | null = currentSchema;
  if (fieldTypes.has("array")) {
    valueSchema =
      !Array.isArray(items) && isJSONSchemaObject(items) ? items : null;
  }

  return new Ok({ fieldTypes, valueSchema });
}

function getValueType(value: unknown): JSONSchemaTypeName {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return Number.isInteger(value) ? "integer" : "number";
    case "object":
      return "object";
    case "string":
      return "string";
    default:
      return "null";
  }
}

function typesInclude(
  types: Set<JSONSchemaTypeName>,
  expectedType: JSONSchemaTypeName
): boolean {
  if (expectedType === "number") {
    return types.has("number") || types.has("integer");
  }
  return types.has(expectedType);
}

function typesAcceptValue(
  types: Set<JSONSchemaTypeName>,
  value: unknown
): boolean {
  const valueType = getValueType(value);
  if (valueType === "integer") {
    return types.has("integer") || types.has("number");
  }
  return types.has(valueType);
}

function formatTypes(types: Set<JSONSchemaTypeName>): string {
  return [...types].sort().join(" or ") || "an unknown type";
}

function validateFieldType({
  expression,
  fieldTypes,
  expectedType,
}: {
  expression: OperationExpression;
  fieldTypes: Set<JSONSchemaTypeName>;
  expectedType: JSONSchemaTypeName;
}): Result<void, Error> {
  if (fieldTypes.size === 0 || typesInclude(fieldTypes, expectedType)) {
    return new Ok(undefined);
  }

  const article = expectedType === "array" ? "an" : "a";
  return new Err(
    new Error(
      `Operator "${expression.op}" requires ${article} ${expectedType} field, but "${expression.field}" is ${formatTypes(fieldTypes)}.`
    )
  );
}

function validateValues(
  expression: OperationExpression,
  valueSchema: JSONSchema | null,
  values: unknown[]
): Result<void, Error> {
  const expectedTypes = getSchemaTypes(valueSchema);
  if (expectedTypes.size === 0) {
    return new Ok(undefined);
  }

  for (const value of values) {
    if (!typesAcceptValue(expectedTypes, value)) {
      return new Err(
        new Error(
          `Value for "${expression.field}" must be ${formatTypes(expectedTypes)}, but received ${getValueType(value)}.`
        )
      );
    }
  }
  return new Ok(undefined);
}

function validateOperationExpression(
  expression: OperationExpression,
  schema: JSONSchema
): Result<void, Error> {
  const fieldSchemaResult = resolveFieldSchema(schema, expression.field);
  if (fieldSchemaResult.isErr()) {
    return fieldSchemaResult;
  }
  const { fieldTypes, valueSchema } = fieldSchemaResult.value;

  switch (expression.op) {
    case "exists":
      return new Ok(undefined);
    case "eq": {
      const valueType = getValueType(expression.value);
      if (valueType === "array" || valueType === "object") {
        return new Err(
          new Error('Operator "eq" only supports scalar comparison values.')
        );
      }
      if (
        fieldTypes.size > 0 &&
        !typesAcceptValue(fieldTypes, expression.value)
      ) {
        return new Err(
          new Error(
            `Value for "${expression.field}" must be ${formatTypes(fieldTypes)}, but received ${valueType}.`
          )
        );
      }
      return new Ok(undefined);
    }
    case "starts-with":
    case "contains": {
      const fieldTypeResult = validateFieldType({
        expression,
        fieldTypes,
        expectedType: "string",
      });
      if (fieldTypeResult.isErr()) {
        return fieldTypeResult;
      }
      if (typeof expression.value !== "string") {
        return new Err(
          new Error(`Operator "${expression.op}" requires a string value.`)
        );
      }
      return new Ok(undefined);
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const fieldTypeResult = validateFieldType({
        expression,
        fieldTypes,
        expectedType: "number",
      });
      if (fieldTypeResult.isErr()) {
        return fieldTypeResult;
      }
      if (typeof expression.value !== "number") {
        return new Err(
          new Error(`Operator "${expression.op}" requires a number value.`)
        );
      }
      return new Ok(undefined);
    }
    case "has": {
      const fieldTypeResult = validateFieldType({
        expression,
        fieldTypes,
        expectedType: "array",
      });
      if (fieldTypeResult.isErr()) {
        return fieldTypeResult;
      }
      return validateValues(expression, valueSchema, [expression.value]);
    }
    case "has-all":
    case "has-any": {
      const fieldTypeResult = validateFieldType({
        expression,
        fieldTypes,
        expectedType: "array",
      });
      if (fieldTypeResult.isErr()) {
        return fieldTypeResult;
      }
      if (!expression.values?.length) {
        return new Err(
          new Error(`Operator "${expression.op}" requires a non-empty list.`)
        );
      }
      return validateValues(expression, valueSchema, expression.values);
    }
    default:
      return assertNever(expression.op);
  }
}

function validateExpression(
  expression: MatcherExpression,
  schema: JSONSchema
): Result<void, Error> {
  if (isLogicalExpression(expression)) {
    if (expression.expressions.length === 0) {
      return new Err(
        new Error(`Operator "${expression.op}" requires an expression.`)
      );
    }
    for (const childExpression of expression.expressions) {
      const childResult = validateExpression(childExpression, schema);
      if (childResult.isErr()) {
        return childResult;
      }
    }
    return new Ok(undefined);
  }

  return validateOperationExpression(expression, schema);
}

export function validateWebhookFilter(
  filter: string,
  schema: JSONSchema
): Result<void, Error> {
  const parseResult = parseMatcherExpression(filter);
  if (parseResult.isErr()) {
    return new Err(
      new Error(`Invalid filter syntax: ${parseResult.error.message}`)
    );
  }

  return validateExpression(parseResult.value, schema);
}
