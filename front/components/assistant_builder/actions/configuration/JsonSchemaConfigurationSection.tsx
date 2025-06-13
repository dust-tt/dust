import {
  Button,
  SparklesIcon,
  TextArea,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { useState } from "react";

import { ConfigurationSectionContainer } from "@app/components/assistant_builder/actions/configuration/ConfigurationSectionContainer";
import { validateConfiguredJsonSchema } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { Result } from "@app/types";

interface JsonSchemaConfigurationSectionProps {
  // The agent's instructions and tool description, needed to generate the
  // schema automatically if requested by the user.
  instructions: string;
  description: string;
  // A string that explains this schema configuration section, displayed to the
  // user.
  sectionConfigurationDescription: string;
  initialSchema: string | null;
  setEdited: (edited: boolean) => void;
  onConfigUpdate: ({
    _jsonSchemaString,
    jsonSchema,
  }: {
    _jsonSchemaString: string | null;
    jsonSchema?: JSONSchema | null;
  }) => void;
  generateSchema: (
    instructions: string
  ) => Promise<Result<Record<string, unknown>, Error>>;
}

export function JsonSchemaConfigurationSection({
  instructions,
  description,
  sectionConfigurationDescription,
  initialSchema,
  setEdited,
  onConfigUpdate,
  generateSchema,
}: JsonSchemaConfigurationSectionProps) {
  const [isGeneratingSchema, setIsGeneratingSchema] = useState(false);
  const sendNotification = useSendNotification();
  const [extractSchema, setExtractSchema] = useState(initialSchema);

  const schemaValidationResult = extractSchema
    ? validateConfiguredJsonSchema(extractSchema)
    : null;

  const generateSchemaFromInstructions = async () => {
    setEdited(true);
    let fullInstructions = `${instructions}`;
    if (description) {
      fullInstructions += `\n\nTool description:\n${description}`;
    }
    if (instructions !== null) {
      setIsGeneratingSchema(true);
      try {
        const res = await generateSchema(fullInstructions);

        if (res.isOk()) {
          const schemaObject = res.value;
          const schemaString = schemaObject
            ? JSON.stringify(schemaObject, null, 2)
            : null;

          setExtractSchema(schemaString);
          setEdited(true);
          onConfigUpdate({
            jsonSchema: schemaObject,
            _jsonSchemaString: schemaString,
          });
        } else {
          sendNotification({
            title: "Failed to generate schema.",
            type: "error",
            description: `An error occurred while generating the schema: ${res.error.message}`,
          });
        }
      } catch (e) {
        sendNotification({
          title: "Failed to generate schema.",
          type: "error",
          description: `An error occurred while generating the schema. Please contact us if the error persists.`,
        });
      } finally {
        setIsGeneratingSchema(false);
      }
    } else {
      setExtractSchema(null);
      setEdited(true);
      onConfigUpdate({
        jsonSchema: null,
        _jsonSchemaString: null,
      });
    }
  };

  return (
    <ConfigurationSectionContainer
      title="Schema"
      description={sectionConfigurationDescription}
    >
      <Button
        tooltip="Automatically re-generate the extraction schema based on Instructions"
        label="Re-generate from Instructions"
        variant="primary"
        icon={SparklesIcon}
        size="sm"
        disabled={isGeneratingSchema || !instructions}
        onClick={generateSchemaFromInstructions}
        className="mb-4"
      />
      <TextArea
        error={
          schemaValidationResult?.isErr()
            ? schemaValidationResult.error.message
            : undefined
        }
        showErrorLabel={true}
        placeholder={
          '{\n  "type": "object",\n  "properties": {\n    "name": { "type": "string" },\n    ...\n  }\n}'
        }
        value={extractSchema ?? ""}
        disabled={isGeneratingSchema}
        onChange={(e) => {
          const newSchemaString = e.target.value;
          setExtractSchema(newSchemaString);
          setEdited(true);

          // If the new schema string is empty, we reset the jsonSchema to
          // null. Storing a null jsonSchema in the database indicates that
          // the model will auto-generate the schema.
          if (newSchemaString === "") {
            onConfigUpdate({
              jsonSchema: null,
              _jsonSchemaString: null,
            });
            return;
          }
          const parsedSchema = validateConfiguredJsonSchema(newSchemaString);
          if (parsedSchema.isOk()) {
            onConfigUpdate({
              jsonSchema: newSchemaString ? parsedSchema.value : null,
              _jsonSchemaString: newSchemaString,
            });
          } else {
            // If parsing fails, still update the string version but don't update the schema
            onConfigUpdate({
              _jsonSchemaString: newSchemaString,
            });
          }
        }}
      />
    </ConfigurationSectionContainer>
  );
}
