import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { ProjectTodoFactory } from "@app/tests/utils/ProjectTodoFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { WorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import type { MockRequest, MockResponse } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";
// After the helper module loads, `lib/auth` is mocked — import `getSession` second
// so this binding is the vi.fn from that mock (same path as the mock target).
import { getSession } from "../../../../../../lib/auth";

import handler from ".";

describe("GET /api/w/[wId]/project_todos/[todoSId]", () => {
  let req: MockRequest<NextApiRequest>;
  let res: MockResponse<NextApiResponse>;
  let workspace: WorkspaceType;

  async function setup() {
    const result = await createPrivateApiMockRequest({ method: "GET" });
    req = result.req;
    res = result.res;
    workspace = result.workspace;
    return result;
  }

  it("returns the todo and project space id", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      text: "Ship the feature",
    });

    req.query.todoSId = todo.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.space.sId).toBe(project.sId);
    expect(body.space.kind).toBe("project");
    expect(body.space.name).toBe(project.name);
    expect(body.todo.sId).toBe(todo.sId);
    expect(body.todo.text).toBe("Ship the feature");
    expect(body.todo.sources).toEqual([]);
  });

  it("returns 404 for an unknown todo sId", async () => {
    await setup();
    req.query.todoSId = "nonexistent_todo_sid";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("project_todo_not_found");
  });

  it("returns 400 when todoSId query param is missing", async () => {
    await setup();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 404 when the user cannot read the todo's project space", async () => {
    const { req, res, workspace, user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
    });

    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "user" });

    vi.mocked(getSession).mockReturnValue(
      Promise.resolve({
        type: "workos",
        sessionId: "outsider-session",
        user: {
          workOSUserId: outsider.workOSUserId!,
          email: outsider.email!,
          email_verified: true,
          name: outsider.username!,
          nickname: outsider.username!,
          organizations: [],
        },
        authenticationMethod: "GoogleOAuth",
        isSSO: false,
        workspaceId: workspace.sId,
        organizationId: workspace.workOSOrganizationId ?? undefined,
        region: "us-central1",
      })
    );

    req.query.todoSId = todo.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("project_todo_not_found");
  });

  it("returns 405 for unsupported methods", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
    });
    req.query.todoSId = todo.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
