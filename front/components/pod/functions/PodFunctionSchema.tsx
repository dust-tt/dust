import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";

interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description: string | null;
}

// A JSON Schema type as a short label. Nested shapes are summarized rather than expanded: the raw
// schema is one click away for anyone who needs the detail.
function fieldTypeLabel(schema: JSONSchema): string {
  if (schema.enum) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  }

  const { type } = schema;
  if (Array.isArray(type)) {
    return type.join(" | ");
  }
  if (type === "array") {
    const items =
      schema.items && !Array.isArray(schema.items) && schema.items !== true
        ? fieldTypeLabel(schema.items)
        : "unknown";
    return `${items}[]`;
  }

  return type ?? "unknown";
}

function topLevelFields(schema: JSONSchema): SchemaField[] {
  const { properties } = schema;
  if (!properties) {
    return [];
  }

  const required = new Set(schema.required ?? []);

  return Object.entries(properties).map(([name, property]) => {
    const propertySchema = typeof property === "boolean" ? {} : property;

    return {
      name,
      type: fieldTypeLabel(propertySchema),
      required: required.has(name),
      description: propertySchema.description ?? null,
    };
  });
}

interface PodFunctionSchemaProps {
  emptyLabel: string;
  label: string;
  schema: JSONSchema;
}

export function PodFunctionSchema({
  emptyLabel,
  label,
  schema,
}: PodFunctionSchemaProps) {
  const fields = topLevelFields(schema);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      {fields.length === 0 ? (
        <span className="text-sm text-muted-foreground">{emptyLabel}</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {fields.map((field) => (
            <li key={field.name} className="text-sm">
              <span className="font-mono">{field.name}</span>
              <span className="text-muted-foreground">: {field.type}</span>
              {!field.required && (
                <span className="text-muted-foreground"> (optional)</span>
              )}
              {field.description && (
                <span className="text-muted-foreground">
                  {" "}
                  — {field.description}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger>
          <span className="cursor-pointer text-xs text-muted-foreground underline">
            Raw schema
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="max-h-64 overflow-auto rounded bg-muted-background p-2 text-xs">
            {JSON.stringify(schema, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
