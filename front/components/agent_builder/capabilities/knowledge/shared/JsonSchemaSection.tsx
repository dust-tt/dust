import { TextArea } from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { useMemo } from "react";

import { validateConfiguredJsonSchema } from "@app/lib/actions/mcp_internal_actions/input_schemas";

interface JsonSchemaSectionProps {
  title: string;
  description: string;
  label: string;
  placeholder: string;
  value: JSONSchema | null;
  onChange: (jsonSchema: JSONSchema | null) => void;
  helpText?: string;
}

export function JsonSchemaSection({
  title,
  description,
  label,
  placeholder,
  value,
  onChange,
  helpText,
}: JsonSchemaSectionProps) {
  const jsonSchemaString = useMemo(() => {
    return value ? JSON.stringify(value, null, 2) : "";
  }, [value]);

  const schemaValidationResult = useMemo(() => {
    return jsonSchemaString
      ? validateConfiguredJsonSchema(jsonSchemaString)
      : null;
  }, [jsonSchemaString]);

  const handleChange = (newSchemaString: string) => {
    if (newSchemaString === "") {
      onChange(null);
      return;
    }

    const parsedSchema = validateConfiguredJsonSchema(newSchemaString);
    if (parsedSchema.isOk()) {
      onChange(parsedSchema.value);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-element-900 text-base font-medium">{title}</h3>
        <p className="text-element-700 mt-1 text-sm">{description}</p>
      </div>
      <div className="space-y-2">
        <label className="text-element-900 block text-sm font-medium">
          {label}
        </label>
        <TextArea
          error={
            schemaValidationResult?.isErr()
              ? schemaValidationResult.error.message
              : undefined
          }
          showErrorLabel={true}
          placeholder={placeholder}
          value={jsonSchemaString}
          onChange={(e) => handleChange(e.target.value)}
          rows={8}
        />
        {helpText && <p className="text-element-600 text-xs">{helpText}</p>}
      </div>
    </div>
  );
}
