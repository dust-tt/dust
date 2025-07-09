import {
  Button,
  SparklesIcon,
  TextArea,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { useEffect, useState } from "react";

import { validateConfiguredJsonSchema } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { WorkspaceType } from "@app/types";

interface JsonSchemaSectionProps {
  label?: string;
  placeholder?: string;
  value: JSONSchema | null;
  initialSchemaString?: string | null;
  onChange: (jsonSchema: JSONSchema | null) => void;
  helpText?: string;
  agentInstructions?: string;
  agentDescription?: string;
  owner: WorkspaceType;
}

export function JsonSchemaSection({
  label,
  placeholder,
  value,
  initialSchemaString,
  onChange,
  helpText,
  agentInstructions,
  agentDescription,
  owner,
}: JsonSchemaSectionProps) {
  const [isGeneratingSchema, setIsGeneratingSchema] = useState(false);
  const sendNotification = useSendNotification();

  const [jsonSchemaString, setJsonSchemaString] = useState(() => {
    return initialSchemaString || (value ? JSON.stringify(value, null, 2) : "");
  });

  // Sync internal state when the external value changes
  useEffect(() => {
    if (!initialSchemaString) {
      const newString = value ? JSON.stringify(value, null, 2) : "";
      setJsonSchemaString(newString);
    }
  }, [value, initialSchemaString]);

  const schemaValidationResult = jsonSchemaString
    ? validateConfiguredJsonSchema(jsonSchemaString)
    : null;

  const generateSchemaFromInstructions = async () => {
    if (!agentInstructions) {
      setJsonSchemaString("");
      onChange(null);
      return;
    }

    setIsGeneratingSchema(true);
    try {
      let fullInstructions = agentInstructions;
      if (agentDescription) {
        fullInstructions += `\n\nTool description:\n${agentDescription}`;
      }

      const res = await fetch(
        `/api/w/${owner.sId}/assistant/builder/process/generate_schema`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            instructions: fullInstructions,
          }),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to generate schema");
      }

      const data = await res.json();
      const schemaObject = data.schema || null;
      const schemaString = schemaObject
        ? JSON.stringify(schemaObject, null, 2)
        : null;

      setJsonSchemaString(schemaString || "");
      onChange(schemaObject);
    } catch (e) {
      sendNotification({
        title: "Failed to generate schema.",
        type: "error",
        description: `An error occurred while generating the schema. Please contact us if the error persists.`,
      });
    } finally {
      setIsGeneratingSchema(false);
    }
  };

  const handleChange = (newSchemaString: string) => {
    setJsonSchemaString(newSchemaString);

    // If the new schema string is empty, we reset the jsonSchema to
    // null. Storing a null jsonSchema in the database indicates that
    // the model will auto-generate the schema.
    if (newSchemaString === "") {
      onChange(null);
      return;
    }
    const parsedSchema = validateConfiguredJsonSchema(newSchemaString);
    if (parsedSchema.isOk()) {
      onChange(newSchemaString ? parsedSchema.value : null);
    } else {
      // If parsing fails, don't update the form value
      // Let user continue typing to fix the JSON
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-element-900 text-base font-medium">Schema</h3>
        <p className="text-element-700 mt-1 text-sm">
          Optionally, provide a schema for the data to be extracted. If you do
          not specify a schema, the tool will determine the schema based on the
          conversation context.
        </p>
      </div>
      <Button
        tooltip="Automatically re-generate the extraction schema based on Instructions"
        label="Re-generate from Instructions"
        variant="primary"
        icon={SparklesIcon}
        size="sm"
        disabled={isGeneratingSchema || !agentInstructions}
        onClick={generateSchemaFromInstructions}
        className="mb-4"
      />
      <div className="space-y-2">
        {label && (
          <label className="text-element-900 block text-sm font-medium">
            {label}
          </label>
        )}
        <TextArea
          error={
            schemaValidationResult?.isErr()
              ? schemaValidationResult.error.message
              : undefined
          }
          showErrorLabel={true}
          placeholder={
            placeholder ||
            '{\n  "type": "object",\n  "properties": {\n    "name": { "type": "string" },\n    ...\n  }\n}'
          }
          value={jsonSchemaString}
          disabled={isGeneratingSchema}
          onChange={(e) => handleChange(e.target.value)}
        />
        {helpText && <p className="text-element-600 text-xs">{helpText}</p>}
      </div>
    </div>
  );
}
