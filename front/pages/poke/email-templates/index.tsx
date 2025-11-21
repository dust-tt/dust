import { Button, Input, TextArea } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import type { JSONSchema7 } from "json-schema";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import PokeLayout from "@app/components/poke/PokeLayout";
import {
  PokeForm,
  PokeFormControl,
  PokeFormField,
  PokeFormItem,
  PokeFormLabel,
} from "@app/components/poke/shadcn/ui/form";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import {
  ConversationsUnreadEmailTemplatePropsSchema,
  renderEmail as renderConversationsUnreadEmail,
} from "@app/lib/notifications/email-templates/conversations-unread";
import {
  DefaultEmailTemplatePropsSchema,
  renderEmail as renderDefaultEmail,
} from "@app/lib/notifications/email-templates/default";

// Template registry - add new templates here as they're created
type TemplateRenderFunction = (args: any) => Promise<string>;

interface EmailTemplate {
  id: string;
  name: string;
  render: TemplateRenderFunction;
  schema: z.ZodObject<any>;
}

const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  default: {
    id: "default",
    name: "Default Template",
    render: renderDefaultEmail,
    schema: DefaultEmailTemplatePropsSchema,
  },
  conversationsUnread: {
    id: "conversationsUnread",
    name: "Conversations Unread Template",
    render: renderConversationsUnreadEmail,
    schema: ConversationsUnreadEmailTemplatePropsSchema,
  },
};

// Helper to get default values from JSON Schema
function getDefaultValuesFromJsonSchema(
  jsonSchema: JSONSchema7
): Record<string, any> {
  const defaults: Record<string, any> = {};
  const properties = jsonSchema.properties ?? {};

  for (const [key, propSchema] of Object.entries(properties)) {
    if (typeof propSchema === "object" && propSchema !== null) {
      if (propSchema.type === "array") {
        // Array type
        if (
          propSchema.items &&
          typeof propSchema.items === "object" &&
          !Array.isArray(propSchema.items)
        ) {
          const itemsSchema = propSchema.items as JSONSchema7;
          if (itemsSchema.type === "object" && itemsSchema.properties) {
            // Array of objects - default to empty array
            defaults[key] = [];
          } else {
            // Array of primitives - default to empty array
            defaults[key] = [];
          }
        } else {
          defaults[key] = [];
        }
      } else if (propSchema.type === "object" && propSchema.properties) {
        // Nested object
        defaults[key] = getDefaultValuesFromJsonSchema(propSchema);
      } else {
        // Simple field - default to empty string
        defaults[key] = "";
      }
    }
  }

  return defaults;
}

// Helper to format field label from key
function formatLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1");
}

// Component for array fields - always calls useFieldArray hook
function ArrayFormField({
  name,
  schema,
  control,
  required = false,
  parentPath = "",
}: {
  name: string;
  schema: JSONSchema7;
  control: any;
  required?: boolean;
  parentPath?: string;
}) {
  const fieldPath = parentPath ? `${parentPath}.${name}` : name;
  const itemsSchema =
    schema.items &&
    typeof schema.items === "object" &&
    !Array.isArray(schema.items)
      ? (schema.items as JSONSchema7)
      : undefined;
  const { fields, append, remove } = useFieldArray({
    control,
    name: fieldPath as any,
  });

  return (
    <div key={name} className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {formatLabel(name)}
          {!required && (
            <span className="ml-2 text-xs text-gray-500">(optional)</span>
          )}
        </h3>
        <Button
          variant="secondary"
          size="xs"
          label="Add Item"
          onClick={() => {
            if (itemsSchema?.type === "object" && itemsSchema.properties) {
              // Array of objects - add empty object with default values
              const defaultItem: Record<string, any> = {};
              for (const [itemKey, itemPropSchema] of Object.entries(
                itemsSchema.properties
              )) {
                if (
                  typeof itemPropSchema === "object" &&
                  itemPropSchema !== null &&
                  !Array.isArray(itemPropSchema)
                ) {
                  if (
                    itemPropSchema.type === "object" &&
                    itemPropSchema.properties
                  ) {
                    defaultItem[itemKey] =
                      getDefaultValuesFromJsonSchema(itemPropSchema);
                  } else {
                    defaultItem[itemKey] = "";
                  }
                }
              }
              append(defaultItem);
            } else {
              // Array of primitives
              append("");
            }
          }}
        />
      </div>
      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <div key={field.id} className="rounded border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium">Item {index + 1}</span>
              <Button
                variant="secondary"
                size="xs"
                label="Remove"
                onClick={() => remove(index)}
              />
            </div>
            {itemsSchema?.type === "object" && itemsSchema.properties ? (
              // Array of objects - render nested fields
              <div className="flex flex-col gap-2">
                {Object.entries(itemsSchema.properties).map(
                  ([itemKey, itemPropSchema]) => {
                    if (
                      typeof itemPropSchema !== "object" ||
                      itemPropSchema === null ||
                      Array.isArray(itemPropSchema)
                    ) {
                      return null;
                    }
                    const isItemRequired =
                      itemsSchema.required?.includes(itemKey) ?? false;
                    return (
                      <SchemaFormField
                        key={itemKey}
                        name={itemKey}
                        schema={itemPropSchema}
                        control={control}
                        required={isItemRequired}
                        parentPath={`${fieldPath}.${index}`}
                      />
                    );
                  }
                )}
              </div>
            ) : (
              // Array of primitives
              <PokeFormField
                control={control}
                name={`${fieldPath}.${index}` as any}
                render={({ field: formField }) => (
                  <PokeFormItem>
                    <PokeFormControl>
                      <Input
                        {...formField}
                        placeholder={`Enter ${formatLabel(name).toLowerCase()} item`}
                      />
                    </PokeFormControl>
                  </PokeFormItem>
                )}
              />
            )}
          </div>
        ))}
        {fields.length === 0 && (
          <p className="text-xs text-gray-500">
            No items yet. Click "Add Item" to add one.
          </p>
        )}
      </div>
    </div>
  );
}

// Recursive component to render form fields based on JSON Schema
function SchemaFormField({
  name,
  schema,
  control,
  required = false,
  parentPath = "",
}: {
  name: string;
  schema: JSONSchema7;
  control: any;
  required?: boolean;
  parentPath?: string;
}) {
  const fieldPath = parentPath ? `${parentPath}.${name}` : name;
  const isTextArea =
    name.toLowerCase().includes("content") ||
    name.toLowerCase().includes("body") ||
    name.toLowerCase().includes("message");

  // Handle arrays - delegate to ArrayFormField component
  if (schema.type === "array") {
    return (
      <ArrayFormField
        name={name}
        schema={schema}
        control={control}
        required={required}
        parentPath={parentPath}
      />
    );
  }

  // Handle nested objects
  if (schema.type === "object" && schema.properties) {
    return (
      <div key={name} className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-semibold">
          {formatLabel(name)}
          {!required && (
            <span className="ml-2 text-xs text-gray-500">(optional)</span>
          )}
        </h3>
        <div className="flex flex-col gap-3">
          {Object.entries(schema.properties).map(
            ([nestedKey, nestedSchema]) => {
              if (
                typeof nestedSchema !== "object" ||
                nestedSchema === null ||
                Array.isArray(nestedSchema)
              ) {
                return null;
              }
              const isNestedRequired =
                schema.required?.includes(nestedKey) ?? false;
              return (
                <SchemaFormField
                  key={nestedKey}
                  name={nestedKey}
                  schema={nestedSchema}
                  control={control}
                  required={isNestedRequired}
                  parentPath={fieldPath}
                />
              );
            }
          )}
        </div>
      </div>
    );
  }

  // Handle simple fields (string, number, etc.)
  return (
    <PokeFormField
      key={name}
      control={control}
      name={fieldPath as any}
      render={({ field: formField }) => (
        <PokeFormItem>
          <PokeFormLabel className="text-sm font-medium">
            {formatLabel(name)}
            {!required && (
              <span className="ml-2 text-xs text-gray-500">(optional)</span>
            )}
          </PokeFormLabel>
          <PokeFormControl>
            {isTextArea ? (
              <TextArea
                {...formField}
                placeholder={`Enter ${formatLabel(name).toLowerCase()}`}
                rows={6}
              />
            ) : (
              <Input
                {...formField}
                placeholder={`Enter ${formatLabel(name).toLowerCase()}`}
              />
            )}
          </PokeFormControl>
        </PokeFormItem>
      )}
    />
  );
}

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function EmailTemplatesPreview() {
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<string>("default");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">(
    "desktop"
  );
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  const [isRendering, setIsRendering] = useState(false);

  const selectedTemplate = EMAIL_TEMPLATES[selectedTemplateId];

  // Convert Zod schema to JSON Schema
  const jsonSchema = useMemo<JSONSchema7 | null>(() => {
    if (!selectedTemplate) {
      return null;
    }
    return zodToJsonSchema(selectedTemplate.schema) as JSONSchema7;
  }, [selectedTemplate]);

  // Initialize form with react-hook-form
  const defaultValues = useMemo(() => {
    if (jsonSchema) {
      return getDefaultValuesFromJsonSchema(jsonSchema);
    }
    return {};
  }, [jsonSchema]);

  const form = useForm({
    resolver: zodResolver(selectedTemplate?.schema ?? z.object({})),
    defaultValues,
  });

  // Reset form when template changes
  useEffect(() => {
    if (jsonSchema) {
      const defaults = getDefaultValuesFromJsonSchema(jsonSchema);
      form.reset(defaults);
    }
  }, [selectedTemplateId, jsonSchema, form]);

  // Watch all form values
  const formValues = form.watch();

  useEffect(() => {
    const renderPreview = async () => {
      if (!selectedTemplate) {
        return;
      }

      setIsRendering(true);
      try {
        // Get current form values
        const values = form.getValues();

        // Clean up empty strings for optional fields
        const cleanedValues: Record<string, any> = {};
        const required = jsonSchema?.required ?? [];
        for (const [key, value] of Object.entries(values)) {
          // Handle arrays - filter out empty items
          if (Array.isArray(value)) {
            const cleanedArray = value.filter((item) => {
              if (typeof item === "object" && item !== null) {
                // For objects in arrays, check if any field has a value
                return Object.values(item).some(
                  (v) => v !== "" && v !== null && v !== undefined
                );
              }
              return item !== "" && item !== null && item !== undefined;
            });
            if (cleanedArray.length > 0 || required.includes(key)) {
              cleanedValues[key] = cleanedArray;
            }
          } else if (value === "" || value === null || value === undefined) {
            if (!required.includes(key)) {
              continue; // Skip optional empty fields
            }
            cleanedValues[key] = value;
          } else {
            cleanedValues[key] = value;
          }
        }

        // Validate and parse with Zod schema
        const parsed = selectedTemplate.schema.parse(cleanedValues);
        const html = await selectedTemplate.render(parsed);
        setRenderedHtml(html);
      } catch (error) {
        console.error("Error rendering email:", error);
        setRenderedHtml(
          `<p>Error rendering email: ${String(error)}</p><pre>${JSON.stringify(error, null, 2)}</pre>`
        );
      } finally {
        setIsRendering(false);
      }
    };

    void renderPreview();
  }, [selectedTemplate, formValues, jsonSchema, form]);

  return (
    <div className="mx-auto h-full w-full max-w-7xl flex-grow flex-col items-center justify-center p-8 pt-8">
      <h1 className="mb-6 text-2xl font-bold">Email Template Preview</h1>

      <div className="grid grid-cols-2 gap-6">
        {/* Form Section */}
        <PokeForm {...form}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Email Template</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                {Object.values(EMAIL_TEMPLATES).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            <h2 className="text-xl font-semibold">Template Parameters</h2>

            {jsonSchema?.properties &&
              Object.entries(jsonSchema.properties).map(([key, propSchema]) => {
                if (
                  typeof propSchema !== "object" ||
                  propSchema === null ||
                  Array.isArray(propSchema)
                ) {
                  return null;
                }

                const isRequired = jsonSchema.required?.includes(key) ?? false;

                return (
                  <SchemaFormField
                    key={key}
                    name={key}
                    schema={propSchema}
                    control={form.control}
                    required={isRequired}
                  />
                );
              })}
          </div>
        </PokeForm>

        {/* Preview Section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Email Preview</h2>
            <div className="flex gap-2">
              <Button
                variant={previewMode === "desktop" ? "primary" : "secondary"}
                size="xs"
                label="Desktop"
                onClick={() => setPreviewMode("desktop")}
              />
              <Button
                variant={previewMode === "mobile" ? "primary" : "secondary"}
                size="xs"
                label="Mobile"
                onClick={() => setPreviewMode("mobile")}
              />
            </div>
          </div>
          {isRendering ? (
            <div className="flex items-center justify-center rounded-lg border p-8">
              <p className="text-muted-foreground">Rendering...</p>
            </div>
          ) : (
            <div
              className={`rounded-lg border bg-white ${
                previewMode === "mobile"
                  ? "mx-auto w-full max-w-[375px]"
                  : "w-full"
              }`}
            >
              <iframe
                srcDoc={renderedHtml}
                className={`border-0 ${
                  previewMode === "mobile"
                    ? "h-[667px] w-full"
                    : "h-[600px] w-full"
                }`}
                title="Email Preview"
                sandbox="allow-same-origin"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

EmailTemplatesPreview.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Email Templates">{page}</PokeLayout>;
};
