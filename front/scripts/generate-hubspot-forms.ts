import * as fs from "fs";
import * as path from "path";

// HubSpot Form Configurations
const FORMS = [
  {
    id: "95a83867-b22c-440a-8ba0-2733d35e4a7b",
    name: "contact",
    outputPath: path.join(__dirname, "../lib/api/hubspot/contactFormSchema.ts"),
    schemaName: "ContactFormSchema",
    typeName: "ContactFormData",
    fieldDefsName: "FIELD_DEFINITIONS",
    responseName: "ContactSubmitResponse",
    regenerateCommand: "npm run generate:hubspot-forms",
    // Extra Zod fields to add to the schema (not in HubSpot)
    extraSchemaFields: [
      {
        comment: "Local field for GDPR marketing consent (not sent to HubSpot)",
        field: "consent_marketing: z.boolean().optional()",
      },
    ],
    // Extra code to add before the options constants
    preOptionsCode: "",
    // Extra code to add after the type definition
    extraCode: `
// Tracking parameters captured from URL/sessionStorage
export const TrackingParamsSchema = z.object({
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  gclid: z.string().optional(),
  fbclid: z.string().optional(),
  msclkid: z.string().optional(),
  li_fat_id: z.string().optional(),
});

export type TrackingParams = z.infer<typeof TrackingParamsSchema>;

// Response from the contact submit API
export interface ContactSubmitResponse {
  success: boolean;
  isQualified: boolean;
  error?: string;
}
`,
  },
  {
    id: "15cb6f7e-6171-450a-a595-db93fc99a54c",
    name: "partner",
    outputPath: path.join(__dirname, "../lib/api/hubspot/partnerFormSchema.ts"),
    schemaName: "PartnerFormSchema",
    typeName: "PartnerFormData",
    fieldDefsName: "PARTNER_FIELD_DEFINITIONS",
    responseName: "PartnerSubmitResponse",
    regenerateCommand: "npm run generate:hubspot-forms",
    // Extra Zod fields to add to the schema (not in HubSpot)
    extraSchemaFields: [],
    // Extra code to add before the field definitions (step constants for multi-step wizard)
    preOptionsCode: `
// Step 1 fields: "Become a Partner"
export const STEP_1_FIELDS = [
  "firstname",
  "lastname",
  "email",
  "company",
  "company_size",
  "headquarters_region",
] as const;

// Step 2 fields: "About a partnership"
export const STEP_2_FIELDS = [
  "partner_type",
  "partner_services",
  "partner_is_dust_user",
  "partner_additionnal_details",
] as const;

// Step 3 fields: "About your customers"
export const STEP_3_FIELDS = [
  "partner_customer_sizes",
  "enterprise_tool_stack",
  "any_existing_lead_to_share_",
] as const;
`,
    // Extra code to add after the type definition
    extraCode: `
// Response from the partner submit API
export interface PartnerSubmitResponse {
  success: boolean;
  error?: string;
}
`,
  },
];

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

interface ExtraSchemaField {
  comment?: string;
  field: string;
}

interface FormConfig {
  id: string;
  name: string;
  outputPath: string;
  schemaName: string;
  typeName: string;
  fieldDefsName: string;
  responseName: string;
  regenerateCommand: string;
  extraSchemaFields: ExtraSchemaField[];
  preOptionsCode: string;
  extraCode: string;
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
    checkbox: "checkbox",
    booleancheckbox: "boolean",
    radio: "radio",
  };
  return typeMap[hubspotType] || "text";
}

// Generate Zod validation for a field
function generateZodValidation(field: HubSpotFormField): string {
  const { name, fieldType, required } = field;

  // Handle checkbox (multi-select) fields
  if (fieldType === "checkbox") {
    if (required) {
      return `z.array(z.string()).min(1, "${field.label} is required")`;
    }
    return `z.array(z.string()).optional()`;
  }

  // Handle boolean checkbox fields
  if (fieldType === "booleancheckbox") {
    if (required) {
      return `z.boolean().refine(val => val === true, { message: "${field.label} is required" })`;
    }
    return `z.boolean().optional()`;
  }

  let validation = "z.string()";

  if (fieldType === "email") {
    if (required) {
      validation = `z.string().min(1, "${field.label} is required").email("Please enter a valid email address")`;
    } else {
      validation = `z.string().email("Please enter a valid email address").optional()`;
    }
  } else if (required) {
    // Generate appropriate error message based on field name
    const labelMap: Record<string, string> = {
      language: "Language is required",
      company_headcount_form: "Company headcount is required",
      partner_type: "Partner type is required",
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
      const label = opt.label || opt.value;
      return `  { value: ${JSON.stringify(opt.value)}, label: ${JSON.stringify(label)} }`;
    })
    .join(",\n");

  return `export const ${constName} = [\n${optionEntries},\n] as const;\n`;
}

function fieldNameToConstName(fieldName: string): string {
  return (
    fieldName
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toUpperCase()
      .replace(/-/g, "_") + "_OPTIONS"
  );
}

async function fetchHubSpotFormDefinition(
  formId: string
): Promise<HubSpotFormDefinition> {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

  if (!token) {
    throw new Error(
      "HUBSPOT_PRIVATE_APP_TOKEN environment variable is required.\n" +
        "Create a HubSpot Private App with 'forms' scope and set the token in .env.local"
    );
  }

  // eslint-disable-next-line no-restricted-globals -- Build-time script, not app code
  const response = await fetch(
    `https://api.hubapi.com/marketing/v3/forms/${formId}`,
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

function generateCode(
  formDefinition: HubSpotFormDefinition,
  config: FormConfig
): string {
  // Extract all fields from field groups, excluding hidden fields
  const fields: HubSpotFormField[] = formDefinition.fieldGroups
    .flatMap((group) => group.fields)
    .filter((field) => !field.hidden);

  // Generate options constants for dropdown, checkbox, and radio fields
  const optionsConsts: string[] = [];
  const fieldsWithOptions = fields.filter(
    (f) =>
      (f.fieldType === "dropdown" ||
        f.fieldType === "checkbox" ||
        f.fieldType === "radio") &&
      f.options &&
      f.options.length > 0
  );

  for (const field of fieldsWithOptions) {
    if (field.options) {
      optionsConsts.push(generateOptionsConst(field.name, field.options));
    }
  }

  // Generate field definitions array
  const fieldDefs = fields
    .map((field) => {
      const type = mapFieldType(field.fieldType);
      const hasOptions =
        (field.fieldType === "dropdown" ||
          field.fieldType === "checkbox" ||
          field.fieldType === "radio") &&
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
  const zodFieldsFromHubSpot = fields.map((field) => {
    return `  ${field.name}: ${generateZodValidation(field)}`;
  });

  // Add extra schema fields if configured
  const extraFields = config.extraSchemaFields.map((extra) => {
    if (extra.comment) {
      return `  // ${extra.comment}\n  ${extra.field}`;
    }
    return `  ${extra.field}`;
  });

  const allZodFields = [...zodFieldsFromHubSpot, ...extraFields].join(",\n");

  // Build the final code
  const code = `/**
 * AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
 *
 * This file is generated from HubSpot form definition.
 * Form ID: ${config.id}
 * Form Name: ${formDefinition.name}
 *
 * To regenerate, run: ${config.regenerateCommand}
 * Requires HUBSPOT_PRIVATE_APP_TOKEN in .env.local
 *
 * Generated at: ${new Date().toISOString()}
 */

import { z } from "zod";

// Field options from HubSpot dropdown/checkbox/radio fields
${optionsConsts.join("\n")}
${config.preOptionsCode}
// Field definitions for dynamic form rendering
export const ${config.fieldDefsName} = [
${fieldDefs},
] as const;

// Zod validation schema
export const ${config.schemaName} = z.object({
${allZodFields},
});

export type ${config.typeName} = z.infer<typeof ${config.schemaName}>;
${config.extraCode}`;

  return code;
}

async function generateForm(config: FormConfig): Promise<void> {
  console.log(`\nProcessing ${config.name} form...`);
  console.log(`  Fetching HubSpot form definition (${config.id})...`);

  const formDefinition = await fetchHubSpotFormDefinition(config.id);
  console.log(`  Found form: "${formDefinition.name}"`);

  const fieldCount = formDefinition.fieldGroups.flatMap((g) => g.fields).length;
  console.log(`  Processing ${fieldCount} fields...`);

  const code = generateCode(formDefinition, config);

  fs.writeFileSync(config.outputPath, code);
  console.log(`  Generated schema written to: ${config.outputPath}`);
}

async function main() {
  console.log("Generating HubSpot form schemas...");

  for (const config of FORMS) {
    await generateForm(config);
  }

  console.log("\nAll forms generated successfully!");
}

main().catch((error) => {
  console.error("Error generating HubSpot form schemas:", error);
  process.exit(1);
});
