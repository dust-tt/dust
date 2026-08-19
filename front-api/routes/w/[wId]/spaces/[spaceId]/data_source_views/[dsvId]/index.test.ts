import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function deleteDataSourceView(
  workspace: { sId: string },
  spaceId: string,
  dsvId: string,
  query: Record<string, string> = {}
) {
  const qs = new URLSearchParams(query).toString();
  const suffix = qs ? `?${qs}` : "";
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/data_source_views/${dsvId}${suffix}`,
    { method: "DELETE" }
  );
}

describe("DELETE /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId", () => {
  it("blocks deletion and names the skill when only a skill uses it, not an agent", async () => {
    const { workspace, globalSpace, auth } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
    });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );
    const skill = await SkillFactory.create(auth, {
      name: "Space Knowledge Skill",
      availability: "workspace_users",
      attachedKnowledge: [{ dataSourceView, nodeId: "node-1" }],
    });

    const response = await deleteDataSourceView(
      workspace,
      globalSpace.sId,
      dataSourceView.sId
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.message).toContain(skill.name);
  });

  it("deletes successfully when forced, bypassing the usage guard", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
    });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );

    const response = await deleteDataSourceView(
      workspace,
      globalSpace.sId,
      dataSourceView.sId,
      { force: "true" }
    );

    expect(response.status).toBe(204);
  });
});
