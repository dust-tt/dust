import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { vantaGet } from "@app/lib/actions/mcp_internal_actions/servers/vanta/api";
import {
  listControlDocumentsSchema,
  listControlsSchema,
  listControlTestsSchema,
  listDocumentResourcesSchema,
  listDocumentsSchema,
  listFrameworkControlsSchema,
  listFrameworksSchema,
  listIntegrationsSchema,
  listPeopleSchema,
  listRisksSchema,
  listTestEntitiesSchema,
  listTestsSchema,
  listVulnerabilitiesSchema,
  VANTA_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/vanta/metadata";
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
} from "@app/lib/actions/mcp_internal_actions/servers/vanta/renderers";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/types";

export default function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(VANTA_TOOL_NAME);

  server.tool(
    "list_tests",
    "List Vanta's automated security and compliance tests with optional filtering by status, category, framework, or integration",
    listTestsSchema,
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
    listTestEntitiesSchema,
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
    listControlsSchema,
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
    listControlTestsSchema,
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
    listControlDocumentsSchema,
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
    listDocumentsSchema,
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
    listDocumentResourcesSchema,
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
    listIntegrationsSchema,
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
    listFrameworksSchema,
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
    listFrameworkControlsSchema,
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
    listPeopleSchema,
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
    listRisksSchema,
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
    listVulnerabilitiesSchema,
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
