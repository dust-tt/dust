import * as fs from "fs";
import * as path from "path";

// HubSpot Form Configuration
const HUBSPOT_FORM_ID = "95a83867-b22c-440a-8ba0-2733d35e4a7b";
const OUTPUT_PATH = path.join(
  __dirname,
  "../components/home/contactFormSchema.generated.ts"
);

// Types for HubSpot Form API response
interface HubSpotFormOption {
  label: string;
  value: string;
  displayOrder: number;
}

interface HubSpotFormField {
  name: string;
  label: string;
  fieldType: string;
  objectTypeId: string;
  required: boolean;
  hidden: boolean;
  placeholder?: string;
  options?: HubSpotFormOption[];
  validation?: {
    useDefaultBlockList?: boolean;
    blockedEmailDomains?: string[];
  };
}

interface HubSpotFieldGroup {
  groupType: string;
  richTextType: string;
  fields: HubSpotFormField[];
}

interface HubSpotFormDefinition {
  id: string;
  name: string;
  fieldGroups: HubSpotFieldGroup[];
  configuration: {
    language: string;
  };
}

// Map HubSpot field types to our input types
function mapFieldType(hubspotType: string): string {
  const typeMap: Record<string, string> = {
    single_line_text: "text",
    email: "email",
    phone: "tel",
    dropdown: "dropdown",
    multi_line_text: "textarea",
    number: "number",
  };
  return typeMap[hubspotType] || "text";
}

// Generate Zod validation for a field
function generateZodValidation(field: HubSpotFormField): string {
  const { name, fieldType, required } = field;

  let validation = "z.string()";

  if (fieldType === "email") {
    if (required) {
      validation = `z.string().min(1, "Work email is required").email("Please enter a valid email address")`;
    } else {
      validation = `z.string().email("Please enter a valid email address").optional()`;
    }
  } else if (required) {
    // Generate appropriate error message based on field name
    const labelMap: Record<string, string> = {
      language: "Language is required",
      company_headcount_form: "Company headcount is required",
    };
    const errorMsg = labelMap[name] || `${field.label} is required`;
    validation = `z.string().min(1, "${errorMsg}")`;
  } else {
    validation = "z.string().optional()";
  }

  return validation;
}

// Convert options to exported const
function generateOptionsConst(
  fieldName: string,
  options: HubSpotFormOption[]
): string {
  const constName = fieldNameToConstName(fieldName);
  const sortedOptions = [...options].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );

  const optionEntries = sortedOptions
    .map((opt) => {
      // For dropdown options, use the value as both value and label if they're the same
      // Otherwise use the HubSpot label
      const label = opt.label || opt.value;
      return `  { value: ${JSON.stringify(opt.value)}, label: ${JSON.stringify(label)} }`;
    })
    .join(",\n");

  return `export const ${constName} = [\n${optionEntries},\n] as const;\n`;
}

function fieldNameToConstName(fieldName: string): string {
  // Convert field name to SCREAMING_SNAKE_CASE + _OPTIONS
  return (
    fieldName
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toUpperCase()
      .replace(/-/g, "_") + "_OPTIONS"
  );
}

async function fetchHubSpotFormDefinition(): Promise<HubSpotFormDefinition> {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

  if (!token) {
    throw new Error(
      "HUBSPOT_PRIVATE_APP_TOKEN environment variable is required.\n" +
        "Create a HubSpot Private App with 'forms' scope and set the token in .env.local"
    );
  }

  // eslint-disable-next-line no-restricted-globals -- Build-time script, not app code
  const response = await fetch(
    `https://api.hubapi.com/marketing/v3/forms/${HUBSPOT_FORM_ID}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to fetch HubSpot form: ${response.status} ${response.statusText}\n${errorBody}`
    );
  }

  return response.json();
}

function generateCode(formDefinition: HubSpotFormDefinition): string {
  // Extract all fields from field groups, excluding hidden fields
  const fields: HubSpotFormField[] = formDefinition.fieldGroups
    .flatMap((group) => group.fields)
    .filter((field) => !field.hidden);

  // Generate options constants for dropdown fields
  const optionsConsts: string[] = [];
  const dropdownFields = fields.filter(
    (f) => f.fieldType === "dropdown" && f.options && f.options.length > 0
  );

  for (const field of dropdownFields) {
    if (field.options) {
      optionsConsts.push(generateOptionsConst(field.name, field.options));
    }
  }

  // Generate field definitions array
  const fieldDefs = fields
    .map((field) => {
      const type = mapFieldType(field.fieldType);
      const hasOptions =
        field.fieldType === "dropdown" &&
        field.options &&
        field.options.length > 0;

      let fieldDef = `  {\n`;
      fieldDef += `    name: ${JSON.stringify(field.name)},\n`;
      fieldDef += `    label: ${JSON.stringify(field.label)},\n`;
      fieldDef += `    type: ${JSON.stringify(type)},\n`;
      fieldDef += `    required: ${field.required},\n`;
      if (field.placeholder) {
        fieldDef += `    placeholder: ${JSON.stringify(field.placeholder)},\n`;
      }
      if (hasOptions) {
        fieldDef += `    options: ${fieldNameToConstName(field.name)},\n`;
      }
      fieldDef += `  }`;
      return fieldDef;
    })
    .join(",\n");

  // Generate Zod schema
  const zodFields = fields
    .map((field) => {
      return `  ${field.name}: ${generateZodValidation(field)}`;
    })
    .join(",\n");

  // Build the final code
  const code = `/**
 * AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
 *
 * This file is generated from HubSpot form definition.
 * Form ID: ${HUBSPOT_FORM_ID}
 * Form Name: ${formDefinition.name}
 *
 * To regenerate, run: npm run generate:contact-form
 * Requires HUBSPOT_PRIVATE_APP_TOKEN in .env.local
 *
 * Generated at: ${new Date().toISOString()}
 */

import { z } from "zod";

// Field options from HubSpot dropdown fields
${optionsConsts.join("\n")}

// Field definitions for dynamic form rendering
export const FIELD_DEFINITIONS = [
${fieldDefs},
] as const;

// Zod validation schema
export const ContactFormSchema = z.object({
${zodFields},
});

export type ContactFormData = z.infer<typeof ContactFormSchema>;
`;

  return code;
}

async function main() {
  console.log("Fetching HubSpot form definition...");

  const formDefinition = await fetchHubSpotFormDefinition();
  console.log(`Found form: "${formDefinition.name}"`);

  const fieldCount = formDefinition.fieldGroups.flatMap((g) => g.fields).length;
  console.log(`Processing ${fieldCount} fields...`);

  const code = generateCode(formDefinition);

  fs.writeFileSync(OUTPUT_PATH, code);
  console.log(`Generated schema written to: ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error("Error generating contact form schema:", error);
  process.exit(1);
});
