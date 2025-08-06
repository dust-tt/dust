import { Button, SparklesIcon, TextArea } from "@dust-tt/sparkle";
import { useState } from "react";
import { useController, useFormContext } from "react-hook-form";

import { useSendNotification } from "@app/hooks/useNotification";
import { validateConfiguredJsonSchema } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { WorkspaceType } from "@app/types";

interface JsonSchemaSectionProps {
  getAgentInstructions: () => string;
  owner: WorkspaceType;
}

export function JsonSchemaSection({
  getAgentInstructions,
  owner,
}: JsonSchemaSectionProps) {
  const { getValues } = useFormContext();

  const { field: jsonSchemaField, fieldState } = useController({
    name: "configuration.jsonSchema",
  });

  const { field: jsonSchemaStringField } = useController({
    name: "configuration._jsonSchemaString",
  });

  const [isGeneratingSchema, setIsGeneratingSchema] = useState(false);
  const sendNotification = useSendNotification();

  const generateSchemaFromInstructions = async () => {
    const agentInstructions = getAgentInstructions();
    if (!agentInstructions) {
      sendNotification({
        title: "Instructions required",
        type: "error",
        description: "Please add agent instructions first.",
      });
      return;
    }

    setIsGeneratingSchema(true);

    try {
      let fullInstructions = agentInstructions;
      const toolDescription = getValues("description");
      if (toolDescription) {
        fullInstructions += `\n\nTool description:\n${toolDescription}`;
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

      jsonSchemaField.onChange(schemaObject);
      jsonSchemaStringField.onChange(schemaString);
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
    // If the new schema string is empty, we reset the jsonSchema to
    // null. Storing a null jsonSchema in the database indicates that
    // the model will auto-generate the schema.
    if (newSchemaString === "") {
      jsonSchemaField.onChange(null);
      jsonSchemaStringField.onChange(null);
      return;
    }

    jsonSchemaStringField.onChange(newSchemaString);

    const parsedSchema = validateConfiguredJsonSchema(newSchemaString);

    // We validate the jsonSchemaString when the form is submitted, so it's okay to not update the jsonSchema value
    // when we cannot parse it.
    if (parsedSchema.isOk()) {
      jsonSchemaField.onChange(parsedSchema.value);
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
        disabled={isGeneratingSchema}
        onClick={generateSchemaFromInstructions}
        className="mb-4"
      />
      <div className="space-y-2">
        <TextArea
          error={fieldState.error?.message}
          showErrorLabel={true}
          placeholder={
            '{\n  "type": "object",\n  "properties": {\n    "name": { "type": "string" },\n    ...\n  }\n}'
          }
          value={jsonSchemaStringField.value}
          disabled={isGeneratingSchema}
          onChange={(e) => handleChange(e.target.value)}
        />
      </div>
    </div>
  );
}
