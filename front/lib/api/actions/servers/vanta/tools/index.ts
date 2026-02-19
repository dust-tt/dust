import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { vantaGet } from "@app/lib/api/actions/servers/vanta/api";
import { buildQuery } from "@app/lib/api/actions/servers/vanta/helpers";
import { VANTA_TOOLS_METADATA } from "@app/lib/api/actions/servers/vanta/metadata";
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
} from "@app/lib/api/actions/servers/vanta/renderers";
import { Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof VANTA_TOOLS_METADATA> = {
  list_tests: async (params, { authInfo }) => {
    const result = await vantaGet({
      path: "/v1/tests",
      schema: VantaTestsResponseSchema,
      query: buildQuery(params),
      authInfo,
    });
    if (result.isErr()) {
      return result;
    }
    return new Ok([{ type: "text" as const, text: renderTests(result.value) }]);
  },

  list_test_entities: async (params, { authInfo }) => {
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
  },

  list_controls: async (params, { authInfo }) => {
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
  },

  list_control_tests: async (params, { authInfo }) => {
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
    return new Ok([{ type: "text" as const, text: renderTests(result.value) }]);
  },

  list_control_documents: async (params, { authInfo }) => {
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
  },

  list_documents: async (params, { authInfo }) => {
    const { documentId, ...rest } = params;
    const path = documentId ? `/v1/documents/${documentId}` : "/v1/documents";
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
  },

  list_document_resources: async (params, { authInfo }) => {
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
  },

  list_integrations: async (params, { authInfo }) => {
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
  },

  list_frameworks: async (params, { authInfo }) => {
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
  },

  list_framework_controls: async (params, { authInfo }) => {
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
  },

  list_people: async (params, { authInfo }) => {
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
  },

  list_risks: async (params, { authInfo }) => {
    const { riskId, ...rest } = params;
    const path = riskId ? `/v1/risk-scenarios/${riskId}` : "/v1/risk-scenarios";
    const result = await vantaGet({
      path,
      schema: VantaRisksResponseSchema,
      query: buildQuery(rest),
      authInfo,
    });
    if (result.isErr()) {
      return result;
    }
    return new Ok([{ type: "text" as const, text: renderRisks(result.value) }]);
  },

  list_vulnerabilities: async (params, { authInfo }) => {
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
  },
};

export const TOOLS: ToolDefinition[] = buildTools(
  VANTA_TOOLS_METADATA,
  handlers
);
