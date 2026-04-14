import type { ConfigurableToolInputType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import logger from "@app/logger/logger";
import { isRecord } from "@app/types/shared/utils/general";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import type {
  JSONSchema7 as JSONSchema,
  JSONSchema7Definition as JSONSchemaDefinition,
} from "json-schema";
import isEqual from "lodash/isEqual";

/**
 * Type guard to check if a value is a JSONSchema object
 */
export function isJSONSchemaObject(
  value:
    | JSONSchema
    | JSONSchemaDefinition
    | JSONSchemaDefinition[]
    | boolean
    | undefined
): value is JSONSchema {
  return !!value && typeof value === "object";
}

/**
 * Compares two JSON schemas for equality, only checking the properties, items and required fields.
 * In particular, it ignores the $schema field.
 */
export function areSchemasEqual(
  schemaA: JSONSchema,
  schemaB: JSONSchema
): boolean {
  if (schemaA.type !== schemaB.type) {
    return false;
  }

  if (!isEqual(schemaA.required, schemaB.required)) {
    return false;
  }

  // Checking for arrays with a single schema for all items.
  if (
    schemaA.type === "array" &&
    // If one is an object and not the other, then they are not equal.
    (isJSONSchemaObject(schemaA.items) !== isJSONSchemaObject(schemaB.items) ||
      // If both are objects, we compare the schemas recursively.
      (isJSONSchemaObject(schemaA.items) &&
        isJSONSchemaObject(schemaB.items) &&
        !areSchemasEqual(schemaA.items, schemaB.items)))
  ) {
    return false;
  }

  if (!isEqual(schemaA.anyOf, schemaB.anyOf)) {
    return false;
  }

  return isEqual(schemaA.properties, schemaB.properties);
}

/**
 * Finds the schema for a property given a $ref to it.
 */
export function followInternalRef(
  schema: JSONSchema,
  ref: string
): JSONSchema | null {
  return findSchemaAtPath(
    schema,
    ref
      .replace("#/", "")
      .split("/")
      .filter((key) => key !== "properties")
  );
}

/**
 * Finds the schema for a property at a specific path in a JSON schema.
 * Handles both object properties and array items.
 */
export function findSchemaAtPath(
  schema: JSONSchema,
  path: string[]
): JSONSchema | null {
  if (path.length === 0) {
    return schema;
  }

  let currentSchema: JSONSchema | null = schema;

  for (const segment of path) {
    if (!currentSchema) {
      return null;
    }

    // Navigate through object properties
    if (currentSchema.properties && segment in currentSchema.properties) {
      const propSchema: JSONSchemaDefinition =
        currentSchema.properties[segment];
      if (isJSONSchemaObject(propSchema)) {
        currentSchema = propSchema;
      } else {
        return null; // Not a valid schema
      }
    } else {
      return null; // Path doesn't exist in the schema
    }
  }

  return currentSchema;
}

/**
 * Ensures that intermediate objects/arrays exist in the path.
 * Creates objects for string keys and arrays when the next key is numeric.
 * Note: For configuration storage, paths like ["filter", "items", "items", "field"]
 * are stored as nested objects, not actual arrays.
 */
export function ensurePathExists(
  obj: Record<string, unknown>,
  path: (string | number)[]
): void {
  if (path.length === 0) {
    return;
  }

  let current: Record<string, unknown> = obj;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const nextKey = path[i + 1];

    if (typeof key === "string") {
      // Check if the next key is numeric to decide whether to create an array or object
      const shouldCreateArray = typeof nextKey === "number";

      // Initialize if it doesn't exist or is the wrong type
      if (!current[key] || typeof current[key] !== "object") {
        current[key] = shouldCreateArray ? [] : {};
      }
      current = current[key] as Record<string, unknown>;
    } else {
      // Numeric index - ensure parent is an array with enough elements
      if (!Array.isArray(current)) {
        return; // Parent should have been an array
      }

      while (current.length <= key) {
        // Check if next key is numeric to decide what to push
        const shouldPushArray = typeof nextKey === "number";
        current.push(shouldPushArray ? [] : {});
      }

      current = current[key] as Record<string, unknown>;
    }
  }
}

/**
 * Sets a value at a specific path in a nested object structure.
 * Assumes that intermediate objects already exist.
 * Use ensurePathExists() first to initialize the path.
 */
export function setValueAtPath(
  obj: Record<string, unknown>,
  path: (string | number)[],
  value: ConfigurableToolInputType | string | number | boolean
): void {
  if (path.length === 0) {
    return;
  }

  let current: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    current = current[key] as Record<string, unknown>;
    if (!current) {
      logger.error(
        {
          path,
          obj,
        },
        "Invalid path in setValueAtPath."
      );
      throw new Error("Invalid path in setValueAtPath.");
    }
  }

  current[path[path.length - 1]] = value;
}

/**
 * Gets a value at a specific path in a nested object structure.
 * Returns undefined if the path doesn't exist or any intermediate object is missing.
 */
export function getValueAtPath(
  obj: Record<string, unknown>,
  path: (string | number)[]
): unknown {
  if (path.length === 0) {
    return obj;
  }

  let current: unknown = obj;
  for (const key of path) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Singleton AJV instance to avoid expensive instantiation on every validation.
 * Creating new AJV instances is costly as we call it frequently (e.g., in MCP tool validation loops).
 *
 * AJV internally caches compiled schemas using the schema object as a Map key,
 * so reusing the same instance provides automatic caching benefits.
 */
let ajvInstance: Ajv | null = null;

function getAjvInstance(): Ajv {
  if (!ajvInstance) {
    ajvInstance = new Ajv();
    addFormats(ajvInstance); // Adds "date", "date-time", "time", "email" and many other common formats.
  }

  return ajvInstance;
}

/**
 * Recursively checks that all required field actually exist in the properties.
 * Returns null if the schema is valid, and the error message otherwise.
 */
function checkRequiredFieldsExist(schema: unknown, path = ""): string | null {
  if (typeof schema !== "object" || schema === null || !isRecord(schema)) {
    return null;
  }

  const properties = schema["properties"];
  const required = schema["required"];

  if (Array.isArray(required)) {
    for (const field of required) {
      if (
        typeof properties !== "object" ||
        properties === null ||
        !(field in properties)
      ) {
        return `"required" field "${field}" at ${path ?? "root"} has no corresponding entry in "properties"`;
      }
    }
  }

  if (
    typeof properties === "object" &&
    properties !== null &&
    isRecord(properties)
  ) {
    for (const [key, val] of Object.entries(properties)) {
      const err = checkRequiredFieldsExist(
        val,
        path ? `${path}.properties.${key}` : `properties.${key}`
      );
      if (err) {
        return err;
      }
    }
  }

  const items = schema["items"];
  if (typeof items === "object" && items !== null) {
    const err = checkRequiredFieldsExist(
      items,
      path ? `${path}.items` : "items"
    );
    if (err) {
      return err;
    }
  }

  return null;
}

/**
 * Validates a generic JSON schema as per the JSON schema specification.
 * Less strict than the JsonSchemaSchema zod schema.
 */
export function validateJsonSchema(
  value: object | string | null | undefined,
  { enforceRequiredFields = false }: { enforceRequiredFields?: boolean } = {}
): {
  isValid: boolean;
  error?: string;
} {
  if (!value) {
    return { isValid: true };
  }

  try {
    const parsed = typeof value !== "object" ? JSON.parse(value) : value;
    const ajv = getAjvInstance();

    ajv.compile(parsed); // Throws an error if the schema is invalid

    if (enforceRequiredFields) {
      const error = checkRequiredFieldsExist(parsed);
      if (error) {
        return { isValid: false, error };
      }
    }

    return { isValid: true };
  } catch (e) {
    return {
      isValid: false,
      error: e instanceof Error ? e.message : "Invalid JSON schema",
    };
  }
}

export function iterateOverSchemaPropertiesRecursive(
  inputSchema: JSONSchema,
  callback: (fullPath: (string | number)[], propSchema: JSONSchema) => boolean,
  path: (string | number)[] = []
): void {
  if (!isJSONSchemaObject(inputSchema)) {
    return;
  }

  // Check properties in object schemas
  if (inputSchema.properties) {
    for (const [key, propSchema] of Object.entries(inputSchema.properties)) {
      const currentPath = [...path, key];

      if (isJSONSchemaObject(propSchema)) {
        // Call the callback with the full path and property schema
        const shouldContinue = callback(currentPath, propSchema);
        if (shouldContinue) {
          // Recursively check this property's schema
          iterateOverSchemaPropertiesRecursive(
            propSchema,
            callback,
            currentPath
          );
        }
      }
    }
  }

  // Check items in array schemas
  if (inputSchema.type === "array" && inputSchema.items) {
    if (isJSONSchemaObject(inputSchema.items)) {
      // Single schema for all items
      iterateOverSchemaPropertiesRecursive(inputSchema.items, callback, [
        ...path,
        "items",
      ]);
    } else if (Array.isArray(inputSchema.items)) {
      // Array of schemas for tuple validation
      for (let i = 0; i < inputSchema.items.length; i++) {
        const item = inputSchema.items[i];
        if (isJSONSchemaObject(item)) {
          iterateOverSchemaPropertiesRecursive(item, callback, [
            ...path,
            "items",
            i,
          ]);
        }
      }
    }
  }
}

const DUST_TOOL_INPUT_MIME_PREFIX = "application/vnd.dust.tool-input.";

/** Hot path: most property schemas are not Dust tool-input mime markers. */
function mimeSchemaIndicatesDustToolInput(mimeSchema: unknown): boolean {
  if (!mimeSchema || typeof mimeSchema !== "object") {
    return false;
  }
  const m = mimeSchema as Record<string, unknown>;
  const c = m.const;
  if (typeof c === "string" && c.startsWith(DUST_TOOL_INPUT_MIME_PREFIX)) {
    return true;
  }
  const en = m.enum;
  if (!Array.isArray(en)) {
    return false;
  }
  for (let i = 0; i < en.length; i++) {
    const v = en[i];
    if (typeof v === "string" && v.startsWith(DUST_TOOL_INPUT_MIME_PREFIX)) {
      return true;
    }
  }
  return false;
}

/**
 * True when this schema describes an object that carries a Dust tool-input mime marker
 * (uri + mimeType pattern used for configurable tool inputs).
 */
function isDustToolInputObjectSchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") {
    return false;
  }
  const s = schema as Record<string, unknown>;
  const props = s.properties;
  if (!props || typeof props !== "object") {
    return false;
  }
  if (
    !mimeSchemaIndicatesDustToolInput(
      (props as Record<string, unknown>).mimeType
    )
  ) {
    return false;
  }
  const t = s.type;
  if (t === undefined || t === "object") {
    return true;
  }
  return Array.isArray(t) && t.includes("object");
}

/**
 * True if somewhere under this schema a Dust tool-input object is reachable via a path
 * where every object property on the path is listed in that object's `required` array
 * (starting from the tool root with the same rule).
 *
 * Performance: optional branches (`pathFromRootAllRequired === false`) return immediately — no
 * nested walk, since descendants cannot sit on an all-required path from the tool root.
 */
export function jsonSchemaHasRequiredDustToolInput(
  schema: unknown,
  pathFromRootAllRequired: boolean
): boolean {
  if (schema === null || schema === undefined) {
    return false;
  }

  if (Array.isArray(schema)) {
    const subs = schema;
    for (let i = 0; i < subs.length; i++) {
      if (
        !jsonSchemaHasRequiredDustToolInput(subs[i], pathFromRootAllRequired)
      ) {
        return false;
      }
    }
    return true;
  }

  if (typeof schema !== "object") {
    return false;
  }

  // Optional JSON subtree: cannot contain a mandatory Dust input from the tool root.
  if (!pathFromRootAllRequired) {
    return false;
  }

  const s = schema as Record<string, unknown> & JSONSchema;

  if (isDustToolInputObjectSchema(s)) {
    return true;
  }

  const allOf = s.allOf;
  if (Array.isArray(allOf)) {
    for (let i = 0; i < allOf.length; i++) {
      if (jsonSchemaHasRequiredDustToolInput(allOf[i], true)) {
        return true;
      }
    }
    return false;
  }

  const oneOf = s.oneOf;
  if (Array.isArray(oneOf)) {
    for (let i = 0; i < oneOf.length; i++) {
      if (!jsonSchemaHasRequiredDustToolInput(oneOf[i], true)) {
        return false;
      }
    }
    return true;
  }

  const anyOf = s.anyOf;
  if (Array.isArray(anyOf)) {
    for (let i = 0; i < anyOf.length; i++) {
      if (!jsonSchemaHasRequiredDustToolInput(anyOf[i], true)) {
        return false;
      }
    }
    return true;
  }

  const rawProps = s.properties;
  if (rawProps && typeof rawProps === "object") {
    const props = rawProps as Record<string, unknown>;
    let requiredNames: Set<string> | undefined;
    const req = s.required;
    if (Array.isArray(req)) {
      requiredNames = new Set<string>();
      for (let i = 0; i < req.length; i++) {
        const name = req[i];
        if (typeof name === "string") {
          requiredNames.add(name);
        }
      }
    }

    for (const propName in props) {
      if (!Object.prototype.hasOwnProperty.call(props, propName)) {
        continue;
      }
      const propSchema = props[propName];
      if (!propSchema || typeof propSchema !== "object") {
        continue;
      }
      if (!(requiredNames?.has(propName) === true)) {
        continue;
      }

      const ps = propSchema as Record<string, unknown>;
      if (ps.type === "array" && ps.items !== undefined) {
        const items = ps.items;
        if (Array.isArray(items)) {
          for (let j = 0; j < items.length; j++) {
            if (jsonSchemaHasRequiredDustToolInput(items[j], true)) {
              return true;
            }
          }
        } else if (jsonSchemaHasRequiredDustToolInput(items, true)) {
          return true;
        }
        continue;
      }

      if (jsonSchemaHasRequiredDustToolInput(propSchema, true)) {
        return true;
      }
    }

    return false;
  }

  if (s.type === "array" && s.items !== undefined) {
    const items = s.items;
    if (Array.isArray(items)) {
      for (let i = 0; i < items.length; i++) {
        if (jsonSchemaHasRequiredDustToolInput(items[i], true)) {
          return true;
        }
      }
      return false;
    }
    return jsonSchemaHasRequiredDustToolInput(items, true);
  }

  return false;
}

/**
 * True when no tool input schema forces a Dust configurable input on an all-required path
 * from the root (see {@link jsonSchemaHasRequiredDustToolInput}).
 */
export function hasNoRequiredProperties(view: MCPServerViewType): boolean {
  const tools = view.server.tools;
  for (let t = 0; t < tools.length; t++) {
    const sch = tools[t].inputSchema;
    if (sch !== undefined && sch !== null) {
      if (jsonSchemaHasRequiredDustToolInput(sch, true)) {
        return false;
      }
    }
  }
  return true;
}
