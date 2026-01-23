import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/types";

import { vantaGet } from "./api";
import {
  renderControls,
  renderDocumentResources,
  renderDocuments,
  renderFrameworks,
  renderIntegrations,
  renderPeople,
  renderRisks,
  renderTestEntities,
  renderTests,
  renderVulnerabilities,
  VantaControlsResponseSchema,
  VantaDocumentResourcesResponseSchema,
  VantaDocumentsResponseSchema,
  VantaFrameworksResponseSchema,
  VantaIntegrationsResponseSchema,
  VantaPeopleResponseSchema,
  VantaRisksResponseSchema,
  VantaTestEntitiesResponseSchema,
  VantaTestsResponseSchema,
  VantaVulnerabilitiesResponseSchema,
} from "./renderers";

const PaginationInput = {
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

export default function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("vanta");
  server.tool(
    "list_tests",
    "List Vanta's automated security and compliance tests with optional filtering by status, category, framework, or integration",
    {
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
      ...PaginationInput,
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "vanta_list_tests", agentLoopContext },
      async (params, { authInfo }) => {
        const result = await vantaGet({
          path: "/v1/tests",
          schema: VantaTestsResponseSchema,
          query: buildQuery(params),
          authInfo,
        });
        if (result.isErr()) {
          return result;
        }
        return new Ok([
          { type: "text" as const, text: renderTests(result.value) },
        ]);
      }
    )
  );

  server.tool(
    "list_test_entities",
    "Get the resources monitored by a specific security test, filter by status using FAILING or DEACTIVATED",
    {
      testId: z.string().describe("The ID of the test to get entities for"),
      statusFilter: z
        .enum(["FAILING", "DEACTIVATED"])
        .describe("Filter entities by status using Vanta API filters")
        .optional(),
      ...PaginationInput,
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "vanta_list_test_entities", agentLoopContext },
      async (params, { authInfo }) => {
        const { testId, ...rest } = params;
        const result = await vantaGet({
          path: `/v1/tests/${testId}/entities`,
          schema: VantaTestEntitiesResponseSchema,
          query: buildQuery(rest),
          authInfo,
        });
        if (result.isErr()) {
          return result;
        }
        return new Ok([
          { type: "text" as const, text: renderTestEntities(result.value) },
        ]);
      }
    )
  );

  server.tool(
    "list_controls",
    "List security controls in your Vanta account or retrieve a specific control by ID with framework mapping details",
    {
      controlId: z
        .string()
        .describe("Specific control ID to retrieve, omit to list all controls")
        .optional(),
      frameworkFilter: z
        .string()
        .describe("Filter controls by framework ID")
        .optional(),
      ...PaginationInput,
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "vanta_list_controls", agentLoopContext },
      async (params, { authInfo }) => {
        const { controlId, ...rest } = params;
        const path = controlId ? `/v1/controls/${controlId}` : "/v1/controls";
        const result = await vantaGet({
          path,
          schema: VantaControlsResponseSchema,
          query: buildQuery(rest),
          authInfo,
        });
        if (result.isErr()) {
          return result;
        }
        return new Ok([
          { type: "text" as const, text: renderControls(result.value) },
        ]);
      }
    )
  );

  server.tool(
    "list_control_tests",
    "Enumerate automated tests that validate a specific security control, including status and failing entity information",
    {
      controlId: z.string().describe("The ID of the control to get tests for"),
      ...PaginationInput,
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "vanta_list_control_tests", agentLoopContext },
      async (params, { authInfo }) => {
        const { controlId, ...rest } = params;
        const result = await vantaGet({
          path: `/v1/controls/${controlId}/tests`,
          schema: VantaTestsResponseSchema,
          query: buildQuery(rest),
          authInfo,
        });
        if (result.isErr()) {
          return result;
        }
        return new Ok([
          { type: "text" as const, text: renderTests(result.value) },
        ]);
      }
    )
  );

  server.tool(
    "list_control_documents",
    "List documents mapped to a control to locate supporting evidence quickly",
    {
      controlId: z
        .string()
        .describe("The ID of the control to get documents for"),
      ...PaginationInput,
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "vanta_list_control_documents",
        agentLoopContext,
      },
      async (params, { authInfo }) => {
        const { controlId, ...rest } = params;
        const result = await vantaGet({
          path: `/v1/controls/${controlId}/documents`,
          schema: VantaDocumentsResponseSchema,
          query: buildQuery(rest),
          authInfo,
        });
        if (result.isErr()) {
          return result;
        }
        return new Ok([
          { type: "text" as const, text: renderDocuments(result.value) },
        ]);
      }
    )
  );

  server.tool(
    "list_documents",
    "List compliance documents in your Vanta account or retrieve a specific document by ID",
    {
      documentId: z
        .string()
        .describe(
          "Specific document ID to retrieve, omit to list all documents"
        )
        .optional(),
      ...PaginationInput,
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "vanta_list_documents", agentLoopContext },
      async (params, { authInfo }) => {
        const { documentId, ...rest } = params;
        const path = documentId
          ? `/v1/documents/${documentId}`
          : "/v1/documents";
        const result = await vantaGet({
          path,
          schema: VantaDocumentsResponseSchema,
          query: buildQuery(rest),
          authInfo,
        });
        if (result.isErr()) {
          return result;
        }
        return new Ok([
          { type: "text" as const, text: renderDocuments(result.value) },
        ]);
      }
    )
  );

  server.tool(
    "list_document_resources",
    "Retrieve resources linked to a document (controls, links, uploads) by choosing the desired resource type",
    {
      documentId: z.string().describe("The ID of the document"),
      resourceType: z
        .enum(["controls", "links", "uploads"])
        .describe("The type of resources to retrieve"),
      ...PaginationInput,
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "vanta_list_document_resources",
        agentLoopContext,
      },
      async (params, { authInfo }) => {
        const { documentId, resourceType, ...rest } = params;
        const result = await vantaGet({
          path: `/v1/documents/${documentId}/${resourceType}`,
          schema: VantaDocumentResourcesResponseSchema,
          query: buildQuery(rest),
          authInfo,
        });
        if (result.isErr()) {
          return result;
        }
        return new Ok([
          {
            type: "text" as const,
            text: renderDocumentResources(result.value, resourceType),
          },
        ]);
      }
    )
  );

  server.tool(
    "list_integrations",
    "List integrations connected to your Vanta account or retrieve details for a specific integration",
    {
      integrationId: z
        .string()
        .describe("Specific integration ID to retrieve, omit to list all")
        .optional(),
      ...PaginationInput,
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "vanta_list_integrations", agentLoopContext },
      async (params, { authInfo }) => {
        const { integrationId, ...rest } = params;
        const path = integrationId
          ? `/v1/integrations/${integrationId}`
          : "/v1/integrations";
        const result = await vantaGet({
          path,
          schema: VantaIntegrationsResponseSchema,
          query: buildQuery(rest),
          authInfo,
        });
        if (result.isErr()) {
          return result;
        }
        return new Ok([
          { type: "text" as const, text: renderIntegrations(result.value) },
        ]);
      }
    )
  );

  server.tool(
    "list_frameworks",
    "List compliance frameworks in your Vanta account with completion status and progress metrics",
    {
      frameworkId: z
        .string()
        .describe("Specific framework ID to retrieve, omit to list all")
        .optional(),
      ...PaginationInput,
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "vanta_list_frameworks", agentLoopContext },
      async (params, { authInfo }) => {
        const { frameworkId, ...rest } = params;
        const path = frameworkId
          ? `/v1/frameworks/${frameworkId}`
          : "/v1/frameworks";
        const result = await vantaGet({
          path,
          schema: VantaFrameworksResponseSchema,
          query: buildQuery(rest),
          authInfo,
        });
        if (result.isErr()) {
          return result;
        }
        return new Ok([
          { type: "text" as const, text: renderFrameworks(result.value) },
        ]);
      }
    )
  );

  server.tool(
    "list_framework_controls",
    "Retrieve the controls associated with a compliance framework, including descriptions and implementation guidance",
    {
      frameworkId: z
        .string()
        .describe("The ID of the framework to get controls for"),
      ...PaginationInput,
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "vanta_list_framework_controls",
        agentLoopContext,
      },
      async (params, { authInfo }) => {
        const { frameworkId, ...rest } = params;
        const result = await vantaGet({
          path: `/v1/frameworks/${frameworkId}/controls`,
          schema: VantaControlsResponseSchema,
          query: buildQuery(rest),
          authInfo,
        });
        if (result.isErr()) {
          return result;
        }
        return new Ok([
          { type: "text" as const, text: renderControls(result.value) },
        ]);
      }
    )
  );

  server.tool(
    "list_people",
    "List people in your Vanta account or retrieve a specific person by ID with role and group membership",
    {
      personId: z
        .string()
        .describe("Specific person ID to retrieve, omit to list all")
        .optional(),
      ...PaginationInput,
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "vanta_list_people", agentLoopContext },
      async (params, { authInfo }) => {
        const { personId, ...rest } = params;
        const path = personId ? `/v1/people/${personId}` : "/v1/people";
        const result = await vantaGet({
          path,
          schema: VantaPeopleResponseSchema,
          query: buildQuery(rest),
          authInfo,
        });
        if (result.isErr()) {
          return result;
        }
        return new Ok([
          { type: "text" as const, text: renderPeople(result.value) },
        ]);
      }
    )
  );

  server.tool(
    "list_risks",
    "List risk scenarios in your risk register or retrieve a specific scenario to review status, scoring, and treatment",
    {
      riskId: z
        .string()
        .describe("Specific risk scenario ID to retrieve, omit to list all")
        .optional(),
      ...PaginationInput,
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "vanta_list_risks", agentLoopContext },
      async (params, { authInfo }) => {
        const { riskId, ...rest } = params;
        const path = riskId
          ? `/v1/risk-scenarios/${riskId}`
          : "/v1/risk-scenarios";
        const result = await vantaGet({
          path,
          schema: VantaRisksResponseSchema,
          query: buildQuery(rest),
          authInfo,
        });
        if (result.isErr()) {
          return result;
        }
        return new Ok([
          { type: "text" as const, text: renderRisks(result.value) },
        ]);
      }
    )
  );

  server.tool(
    "list_vulnerabilities",
    "List vulnerabilities detected across your infrastructure with CVE details, severity, and impacted assets",
    {
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
      ...PaginationInput,
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "vanta_list_vulnerabilities",
        agentLoopContext,
      },
      async (params, { authInfo }) => {
        const result = await vantaGet({
          path: "/v1/vulnerabilities",
          schema: VantaVulnerabilitiesResponseSchema,
          query: buildQuery(params),
          authInfo,
        });
        if (result.isErr()) {
          return result;
        }

        return new Ok([
          {
            type: "text" as const,
            text: renderVulnerabilities(result.value),
          },
        ]);
      }
    )
  );

  return server;
}

function buildQuery(
  params: Record<string, unknown>
): Record<string, string> | undefined {
  const query: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return;
      }
      query[key] = value.join(",");
      return;
    }
    if (typeof value === "boolean") {
      query[key] = value ? "true" : "false";
      return;
    }
    query[key] = typeof value === "string" ? value : String(value);
  });

  return Object.keys(query).length ? query : undefined;
}
