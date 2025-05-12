import { AssistantBuilderProcessConfiguration } from "@app/components/assistant_builder/types";
import { isValidJsonSchema } from "@app/lib/utils/json_schemas";
import { Result } from "@app/types";
import {
  Button,
  SparklesIcon,
  TextArea,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface JsonSchemaConfigurationSectionProps {
  instructions: string;
  description: string;
  schemaConfigurationDescription: string;
  schemaEdit: string | null;
  setSchemaEdit: (schemaEdit: string | null) => void;
  setEdited: (edited: boolean) => void;
  updateAction: (
    setNewActionConfig: (
      previousAction: AssistantBuilderProcessConfiguration
    ) => AssistantBuilderProcessConfiguration
  ) => void;
  generateSchema: (
    instructions: string
  ) => Promise<Result<Record<string, unknown>, Error>>;
}

export function JsonSchemaConfigurationSection({
  instructions,
  description,
  schemaConfigurationDescription,
  schemaEdit,
  setSchemaEdit,
  setEdited,
  updateAction,
  generateSchema,
}: JsonSchemaConfigurationSectionProps) {
  const [isGeneratingSchema, setIsGeneratingSchema] = useState(false);
  const sendNotification = useSendNotification();

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

          setSchemaEdit(schemaString);
          setEdited(true);
          updateAction((previousAction) => ({
            ...previousAction,
            jsonSchema: schemaObject,
            _jsonSchemaString: schemaString,
          }));
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
      setSchemaEdit(null);
      setEdited(true);
      updateAction((previousAction) => ({
        ...previousAction,
        jsonSchema: null,
        _jsonSchemaString: null,
      }));
    }
  };

  return (
    <>
      <div className="font-semibold text-muted-foreground dark:text-muted-foreground-night">
        Schema
      </div>
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        {schemaConfigurationDescription}
      </div>
      <Button
        tooltip="Automatically re-generate the extraction schema based on Instructions"
        label="Re-generate from Instructions"
        variant="primary"
        icon={SparklesIcon}
        size="sm"
        disabled={isGeneratingSchema || !instructions}
        onClick={generateSchemaFromInstructions}
      />
      <TextArea
        error={schemaEdit ? isValidJsonSchema(schemaEdit).error : undefined}
        showErrorLabel={true}
        placeholder={
          '{\n  "type": "object",\n  "properties": {\n    "name": { "type": "string" },\n    ...\n  }\n}'
        }
        value={schemaEdit ?? ""}
        disabled={isGeneratingSchema}
        onChange={(e) => {
          const newSchemaString = e.target.value;
          setSchemaEdit(newSchemaString);
          setEdited(true);

          const parsedSchema = isValidJsonSchema(newSchemaString);
          if (parsedSchema.isValid) {
            updateAction((previousAction) => ({
              ...previousAction,
              jsonSchema: newSchemaString ? JSON.parse(newSchemaString) : null,
              _jsonSchemaString: newSchemaString,
            }));
          } else {
            // If parsing fails, still update the string version but don't update the schema
            updateAction((previousAction) => ({
              ...previousAction,
              _jsonSchemaString: newSchemaString,
            }));
          }
        }}
      />
    </>
  );
}
