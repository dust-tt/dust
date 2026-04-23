import { describe, expect, it, vi } from "vitest";

// postUserMessage eventually starts the agent loop; mock Temporal so tests do not
// hit a real client or leave an unhandled rejection after the handler returns.
vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn().mockResolvedValue({ isOk: () => true }),
  launchCompactionWorkflow: vi.fn().mockResolvedValue({ isOk: () => true }),
}));

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { ProjectTodoFactory } from "@app/tests/utils/ProjectTodoFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { WorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import type { MockRequest, MockResponse } from "node-mocks-http";

import handler from "./start";

describe("POST /api/w/[wId]/spaces/[spaceId]/project_todos/[todoId]/start", () => {
  let req: MockRequest<NextApiRequest>;
  let res: MockResponse<NextApiResponse>;
  let workspace: WorkspaceType;

  async function setup(method = "POST") {
    const result = await createPrivateApiMockRequest({ method: method as any });
    req = result.req;
    res = result.res;
    workspace = result.workspace;
    return result;
  }

  it("creates and links a conversation for a to_do todo", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      category: "to_do",
      text: "Prepare launch checklist",
    });

    req.query.spaceId = project.sId;
    req.query.todoId = todo.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.todo.sId).toBe(todo.sId);
    expect(data.todo.conversationId).toBeTruthy();
  });

  it("returns 400 when starting a non to_do todo", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      category: "to_know",
    });

    req.query.spaceId = project.sId;
    req.query.todoId = todo.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 405 for unsupported methods", async () => {
    const { user } = await setup("GET");
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      category: "to_do",
    });

    req.query.spaceId = project.sId;
    req.query.todoId = todo.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
