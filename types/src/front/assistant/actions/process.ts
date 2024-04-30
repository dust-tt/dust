// Properties in the process configuration table are stored as an array of objects.
export type ProcessSchemaPropertyType = {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
};

export function renderSchemaPropertiesAsJSONSchema(
  schema: ProcessSchemaPropertyType[]
): { [name: string]: { type: string; description: string } } {
  let jsonSchema: { [name: string]: { type: string; description: string } } =
    {};

  if (schema.length > 0) {
    schema.forEach((f) => {
      jsonSchema[f.name] = {
        type: f.type,
        description: f.description,
      };
    });
  } else {
    // Default schema for extraction.
    jsonSchema = {
      required_data: {
        type: "string",
        description:
          "Minimal (short and concise) piece of information extracted to follow instructions",
      },
    };
  }

  return jsonSchema;
}
