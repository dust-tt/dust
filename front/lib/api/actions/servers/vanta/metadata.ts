import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const VANTA_TOOL_NAME = "vanta" as const;

const PaginationSchema = {
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

export const VANTA_TOOLS_METADATA = createToolsRecord({
  list_tests: {
    description:
      "List Vanta's automated security and compliance tests with optional filtering by status, category, framework, or integration",
    schema: {
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
      ...PaginationSchema,
    },
    stake: "never_ask",
    displayLabels: { running: "Listing Vanta tests", done: "List Vanta tests" },
  },
  list_test_entities: {
    description:
      "Get the resources monitored by a specific security test, filter by status using FAILING or DEACTIVATED",
    schema: {
      testId: z.string().describe("The ID of the test to get entities for"),
      statusFilter: z
        .enum(["FAILING", "DEACTIVATED"])
        .describe("Filter entities by status using Vanta API filters")
        .optional(),
      ...PaginationSchema,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Vanta test entities",
      done: "List Vanta test entities",
    },
  },
  list_controls: {
    description:
      "List security controls in your Vanta account or retrieve a specific control by ID with framework mapping details",
    schema: {
      controlId: z
        .string()
        .describe("Specific control ID to retrieve, omit to list all controls")
        .optional(),
      frameworkFilter: z
        .string()
        .describe("Filter controls by framework ID")
        .optional(),
      ...PaginationSchema,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Vanta controls",
      done: "List Vanta controls",
    },
  },
  list_control_tests: {
    description:
      "Enumerate automated tests that validate a specific security control, including status and failing entity information",
    schema: {
      controlId: z.string().describe("The ID of the control to get tests for"),
      ...PaginationSchema,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Vanta control tests",
      done: "List Vanta control tests",
    },
  },
  list_control_documents: {
    description:
      "List documents mapped to a control to locate supporting evidence quickly",
    schema: {
      controlId: z
        .string()
        .describe("The ID of the control to get documents for"),
      ...PaginationSchema,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Vanta control documents",
      done: "List Vanta control documents",
    },
  },
  list_documents: {
    description:
      "List compliance documents in your Vanta account or retrieve a specific document by ID",
    schema: {
      documentId: z
        .string()
        .describe(
          "Specific document ID to retrieve, omit to list all documents"
        )
        .optional(),
      ...PaginationSchema,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Vanta documents",
      done: "List Vanta documents",
    },
  },
  list_document_resources: {
    description:
      "Retrieve resources linked to a document (controls, links, uploads) by choosing the desired resource type",
    schema: {
      documentId: z.string().describe("The ID of the document"),
      resourceType: z
        .enum(["controls", "links", "uploads"])
        .describe("The type of resources to retrieve"),
      ...PaginationSchema,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Vanta document resources",
      done: "List Vanta document resources",
    },
  },
  list_integrations: {
    description:
      "List integrations connected to your Vanta account or retrieve details for a specific integration",
    schema: {
      integrationId: z
        .string()
        .describe("Specific integration ID to retrieve, omit to list all")
        .optional(),
      ...PaginationSchema,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Vanta integrations",
      done: "List Vanta integrations",
    },
  },
  list_frameworks: {
    description:
      "List compliance frameworks in your Vanta account with completion status and progress metrics",
    schema: {
      frameworkId: z
        .string()
        .describe("Specific framework ID to retrieve, omit to list all")
        .optional(),
      ...PaginationSchema,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Vanta frameworks",
      done: "List Vanta frameworks",
    },
  },
  list_framework_controls: {
    description:
      "Retrieve the controls associated with a compliance framework, including descriptions and implementation guidance",
    schema: {
      frameworkId: z
        .string()
        .describe("The ID of the framework to get controls for"),
      ...PaginationSchema,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Vanta framework controls",
      done: "List Vanta framework controls",
    },
  },
  list_people: {
    description:
      "List people in your Vanta account or retrieve a specific person by ID with role and group membership",
    schema: {
      personId: z
        .string()
        .describe("Specific person ID to retrieve, omit to list all")
        .optional(),
      ...PaginationSchema,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing people on Vanta",
      done: "List people on Vanta",
    },
  },
  list_risks: {
    description:
      "List risk scenarios in your risk register or retrieve a specific scenario to review status, scoring, and treatment",
    schema: {
      riskId: z
        .string()
        .describe("Specific risk scenario ID to retrieve, omit to list all")
        .optional(),
      ...PaginationSchema,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing risks on Vanta",
      done: "List risks on Vanta",
    },
  },
  list_vulnerabilities: {
    description:
      "List vulnerabilities detected across your infrastructure with CVE details, severity, and impacted assets",
    schema: {
      q: z
        .string()
        .describe("Filter vulnerabilities by search query")
        .optional(),
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
      ...PaginationSchema,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing vulnerabilities on Vanta",
      done: "List vulnerabilities on Vanta",
    },
  },
});

export const VANTA_SERVER = {
  serverInfo: {
    name: "vanta",
    version: "1.0.0",
    description:
      "Review compliance posture powered by Vanta's security platform.",
    authorization: {
      provider: "vanta" as const,
      supported_use_cases: ["platform_actions"] as const,
    },
    icon: "VantaLogo",
    documentationUrl: "https://docs.dust.tt/docs/vanta",
    instructions: null,
  },
  tools: Object.values(VANTA_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(VANTA_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
