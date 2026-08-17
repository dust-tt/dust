import { isToolGeneratedFilePath } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { SandboxFunctionRunContext } from "@app/lib/actions/types";
import { executeQuery } from "@app/lib/api/actions/servers/query_tables_v2/helpers";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { createPersistedSandboxFunctionInvocationTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { CoreAPI } from "@app/types/core/core_api";
import { getPodFilesBasePath } from "@app/types/mount_path";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("executeQuery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes query results to the pod function tool outputs folder", async () => {
    const {
      auth,
      workspace,
      invocation,
      globalSpace,
      podSpace,
      sandboxFunction,
    } = await createPersistedSandboxFunctionInvocationTokenTestContext();
    const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
      name: "common_utilities",
      useCase: null,
    });
    const view = await MCPServerViewFactory.create(
      workspace,
      server.id,
      globalSpace
    );
    const action = await SandboxFunctionMCPActionFactory.create(auth, {
      invocation,
      mcpServerView: view,
    });
    const runContext: SandboxFunctionRunContext = {
      contextType: "sandbox_function",
      action,
      invocation,
      toolConfiguration: action.toolConfiguration,
    };

    fileStorageMock.reset();
    vi.spyOn(CoreAPI.prototype, "queryDatabase").mockResolvedValue(
      new Ok({
        schema: [
          { name: "name", value_type: "text", possible_values: null },
          { name: "count", value_type: "int", possible_values: null },
        ],
        results: [{ value: { name: "Ada", count: 2 } }],
      })
    );

    const result = await executeQuery(auth, {
      tables: [
        {
          project_id: 1,
          data_source_id: "data-source-id",
          table_id: "table-id",
        },
      ],
      query: "SELECT name, count FROM table-id",
      runContext,
      fileName: "query-results",
      connectorProvider: null,
    });

    assert(result.isOk());
    const fileOutput = result.value.find(isToolGeneratedFilePath);
    assert(fileOutput);

    const scopedPathPrefix = `pod-${podSpace.sId}/.tool_outputs/${sandboxFunction.slug}/`;
    expect(fileOutput.resource.path).toBe(fileOutput.resource.uri);
    expect(fileOutput.resource.path).toBe(
      `${scopedPathPrefix}${fileOutput.resource.title}`
    );
    expect(fileOutput.resource.title).toMatch(/^\d+_query_results_.*\.csv$/);
    expect(fileOutput.resource.contentType).toBe("text/csv");

    expect(fileStorageMock.saveFileCalls).toHaveLength(1);
    const fileWrite = fileStorageMock.saveFileCalls[0];
    const relativePath = fileOutput.resource.path.slice(
      `pod-${podSpace.sId}/`.length
    );
    expect(fileWrite.filePath).toBe(
      `${getPodFilesBasePath({
        workspaceId: workspace.sId,
        podId: podSpace.sId,
      })}${relativePath}`
    );
    expect(fileWrite.content.toString()).toBe("name,count\nAda,2\n");
    expect(fileWrite.contentType).toBe("text/csv");
  });
});
