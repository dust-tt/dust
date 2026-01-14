import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const VANTA_TOOL_NAME = "vanta" as const;

// =============================================================================
// Shared Schemas
// =============================================================================

export const paginationInputSchema = {
  pageSize: z
    .number()
    .min(1)
    .max(100)
    .describe("Maximum number of results per page (1-100), default is 10")
    .optional(),
  pageCursor: z
    .string()
    .describe("Pagination cursor from a previous response")
    .optional(),
};

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const listTestsSchema = {
  statusFilter: z
    .enum([
      "OK",
      "DEACTIVATED",
      "NEEDS_ATTENTION",
      "IN_PROGRESS",
      "INVALID",
      "NOT_APPLICABLE",
    ])
    .describe(
      "Filter tests by status: OK, DEACTIVATED, NEEDS_ATTENTION, IN_PROGRESS, INVALID, NOT_APPLICABLE"
    )
    .optional(),
  categoryFilter: z
    .enum([
      "ACCOUNTS_ACCESS",
      "ACCOUNT_SECURITY",
      "ACCOUNT_SETUP",
      "COMPUTERS",
      "CUSTOM",
      "DATA_STORAGE",
      "EMPLOYEES",
      "INFRASTRUCTURE",
      "IT",
      "LOGGING",
      "MONITORING_ALERTS",
      "PEOPLE",
      "POLICIES",
      "RISK_ANALYSIS",
      "SECURITY_ALERT_MANAGEMENT",
      "SOFTWARE_DEVELOPMENT",
      "VENDORS",
      "VULNERABILITY_MANAGEMENT",
    ])
    .describe("Filter tests by category")
    .optional(),
  frameworkFilter: z
    .string()
    .describe("Filter tests by framework ID")
    .optional(),
  integrationFilter: z
    .string()
    .describe("Filter tests by integration ID")
    .optional(),
  ...paginationInputSchema,
};

export const listTestEntitiesSchema = {
  testId: z.string().describe("The ID of the test to get entities for"),
  statusFilter: z
    .enum(["FAILING", "DEACTIVATED"])
    .describe("Filter entities by status using Vanta API filters")
    .optional(),
  ...paginationInputSchema,
};

export const listControlsSchema = {
  controlId: z
    .string()
    .describe("Specific control ID to retrieve, omit to list all controls")
    .optional(),
  frameworkFilter: z
    .string()
    .describe("Filter controls by framework ID")
    .optional(),
  ...paginationInputSchema,
};

export const listControlTestsSchema = {
  controlId: z.string().describe("The ID of the control to get tests for"),
  ...paginationInputSchema,
};

export const listControlDocumentsSchema = {
  controlId: z.string().describe("The ID of the control to get documents for"),
  ...paginationInputSchema,
};

export const listDocumentsSchema = {
  documentId: z
    .string()
    .describe("Specific document ID to retrieve, omit to list all documents")
    .optional(),
  ...paginationInputSchema,
};

export const listDocumentResourcesSchema = {
  documentId: z.string().describe("The ID of the document"),
  resourceType: z
    .enum(["controls", "links", "uploads"])
    .describe("The type of resources to retrieve"),
  ...paginationInputSchema,
};

export const listIntegrationsSchema = {
  integrationId: z
    .string()
    .describe("Specific integration ID to retrieve, omit to list all")
    .optional(),
  ...paginationInputSchema,
};

export const listFrameworksSchema = {
  frameworkId: z
    .string()
    .describe("Specific framework ID to retrieve, omit to list all")
    .optional(),
  ...paginationInputSchema,
};

export const listFrameworkControlsSchema = {
  frameworkId: z
    .string()
    .describe("The ID of the framework to get controls for"),
  ...paginationInputSchema,
};

export const listPeopleSchema = {
  personId: z
    .string()
    .describe("Specific person ID to retrieve, omit to list all")
    .optional(),
  ...paginationInputSchema,
};

export const listRisksSchema = {
  riskId: z
    .string()
    .describe("Specific risk scenario ID to retrieve, omit to list all")
    .optional(),
  ...paginationInputSchema,
};

export const listVulnerabilitiesSchema = {
  q: z.string().describe("Filter vulnerabilities by search query").optional(),
  isDeactivated: z
    .boolean()
    .describe("Filter vulnerabilities by deactivation status")
    .optional(),
  externalVulnerabilityId: z
    .string()
    .describe("Filter vulnerabilities based on a specific external ID")
    .optional(),
  isFixAvailable: z
    .boolean()
    .describe("Filter vulnerabilities that have an available fix")
    .optional(),
  packageIdentifier: z
    .string()
    .describe("Filter vulnerabilities that are from a specific package")
    .optional(),
  slaDeadlineAfterDate: z
    .string()
    .describe(
      "Filter vulnerabilities with a fix due after a specific timestamp"
    )
    .optional(),
  slaDeadlineBeforeDate: z
    .string()
    .describe(
      "Filter vulnerabilities with a fix due before a specific timestamp"
    )
    .optional(),
  severity: z
    .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"])
    .describe("Filter vulnerabilities by severity")
    .optional(),
  integrationId: z
    .string()
    .describe(
      "Filter vulnerabilities by the vulnerability scanner that detected them"
    )
    .optional(),
  includeVulnerabilitiesWithoutSlas: z
    .boolean()
    .describe("Filter vulnerabilities without an SLA due date")
    .optional(),
  vulnerableAssetId: z
    .string()
    .describe("Filter vulnerabilities by a specific asset ID")
    .optional(),
  ...paginationInputSchema,
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const VANTA_TOOLS: MCPToolType[] = [
  {
    name: "list_tests",
    description:
      "List Vanta's automated security and compliance tests with optional filtering by status, category, framework, or integration",
    inputSchema: zodToJsonSchema(z.object(listTestsSchema)) as JSONSchema,
  },
  {
    name: "list_test_entities",
    description:
      "Get the resources monitored by a specific security test, filter by status using FAILING or DEACTIVATED",
    inputSchema: zodToJsonSchema(
      z.object(listTestEntitiesSchema)
    ) as JSONSchema,
  },
  {
    name: "list_controls",
    description:
      "List security controls in your Vanta account or retrieve a specific control by ID with framework mapping details",
    inputSchema: zodToJsonSchema(z.object(listControlsSchema)) as JSONSchema,
  },
  {
    name: "list_control_tests",
    description:
      "Enumerate automated tests that validate a specific security control, including status and failing entity information",
    inputSchema: zodToJsonSchema(
      z.object(listControlTestsSchema)
    ) as JSONSchema,
  },
  {
    name: "list_control_documents",
    description:
      "List documents mapped to a control to locate supporting evidence quickly",
    inputSchema: zodToJsonSchema(
      z.object(listControlDocumentsSchema)
    ) as JSONSchema,
  },
  {
    name: "list_documents",
    description:
      "List compliance documents in your Vanta account or retrieve a specific document by ID",
    inputSchema: zodToJsonSchema(z.object(listDocumentsSchema)) as JSONSchema,
  },
  {
    name: "list_document_resources",
    description:
      "Retrieve resources linked to a document (controls, links, uploads) by choosing the desired resource type",
    inputSchema: zodToJsonSchema(
      z.object(listDocumentResourcesSchema)
    ) as JSONSchema,
  },
  {
    name: "list_integrations",
    description:
      "List integrations connected to your Vanta account or retrieve details for a specific integration",
    inputSchema: zodToJsonSchema(
      z.object(listIntegrationsSchema)
    ) as JSONSchema,
  },
  {
    name: "list_frameworks",
    description:
      "List compliance frameworks in your Vanta account with completion status and progress metrics",
    inputSchema: zodToJsonSchema(z.object(listFrameworksSchema)) as JSONSchema,
  },
  {
    name: "list_framework_controls",
    description:
      "Retrieve the controls associated with a compliance framework, including descriptions and implementation guidance",
    inputSchema: zodToJsonSchema(
      z.object(listFrameworkControlsSchema)
    ) as JSONSchema,
  },
  {
    name: "list_people",
    description:
      "List people in your Vanta account or retrieve a specific person by ID with role and group membership",
    inputSchema: zodToJsonSchema(z.object(listPeopleSchema)) as JSONSchema,
  },
  {
    name: "list_risks",
    description:
      "List risk scenarios in your risk register or retrieve a specific scenario to review status, scoring, and treatment",
    inputSchema: zodToJsonSchema(z.object(listRisksSchema)) as JSONSchema,
  },
  {
    name: "list_vulnerabilities",
    description:
      "List vulnerabilities detected across your infrastructure with CVE details, severity, and impacted assets",
    inputSchema: zodToJsonSchema(
      z.object(listVulnerabilitiesSchema)
    ) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const VANTA_SERVER_INFO = {
  name: "vanta" as const,
  version: "1.0.0",
  description:
    "Review compliance posture powered by Vanta's security platform.",
  authorization: {
    provider: "vanta" as const,
    supported_use_cases: ["platform_actions"] as MCPOAuthUseCase[],
  },
  icon: "VantaLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/vanta",
  instructions: null,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const VANTA_TOOL_STAKES = {
  list_tests: "never_ask",
  list_test_entities: "never_ask",
  list_controls: "never_ask",
  list_control_tests: "never_ask",
  list_control_documents: "never_ask",
  list_documents: "never_ask",
  list_document_resources: "never_ask",
  list_integrations: "never_ask",
  list_integration_resources: "never_ask",
  list_frameworks: "never_ask",
  list_framework_controls: "never_ask",
  list_people: "never_ask",
  list_risks: "never_ask",
  list_vulnerabilities: "never_ask",
} as const satisfies Record<string, MCPToolStakeLevelType>;
