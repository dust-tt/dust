import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { serializeSkillTag } from "@app/lib/skills/format";
import { serializeToolTag } from "@app/lib/tools/format";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("POST /api/poke/workspaces/:wId/skills/suggestions", () => {
  it("stores inline tool and skill references", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
      role: "admin",
    });

    const serverView =
      await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        "agent_memory"
      );
    expect(serverView).not.toBeNull();
    if (!serverView) {
      return;
    }
    const referencedSkillId = "frames";
    const instructions = `Search with ${serializeToolTag({
      icon: null,
      id: serverView.sId,
      name: "Source search",
    })}, then use ${serializeSkillTag({
      icon: null,
      id: referencedSkillId,
      name: "Frames",
    })}.`;

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/skills/suggestions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Source research",
          userFacingDescription: "Verifies sources before answering.",
          agentFacingDescription: "Use when an answer needs verified sources.",
          instructions,
          icon: "MagnifyingGlassIcon",
          mcpServerViewIds: [serverView.sId],
        }),
      }
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.skill.instructions).toBe(instructions);
    expect(data.skill.instructionsHtml).toContain(serverView.sId);
    expect(data.skill.instructionsHtml).toContain(referencedSkillId);
    expect(data.skill.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ sId: serverView.sId })])
    );

    const createdSkill = await SkillResource.fetchById(auth, data.skill.sId);
    expect(createdSkill).not.toBeNull();
    if (!createdSkill) {
      return;
    }

    const childSkills = await SkillResource.batchFetchChildSkills(auth, [
      createdSkill,
    ]);
    expect(
      childSkills.get(createdSkill.sId)?.map((skill) => skill.sId)
    ).toEqual([referencedSkillId]);
  });
});
