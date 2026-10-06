import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { TemplateFactory } from "@app/tests/utils/TemplateFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function get(workspace: { sId: string }, templateId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/builder/sidekick/prompt/template?templateId=${templateId}`
  );
}

describe("GET /api/w/[wId]/assistant/builder/sidekick/prompt/template", () => {
  it("returns the prompt for a published template", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const template = await TemplateFactory.published();
    await template.updateAttributes({
      sidekickInstructions: "Published sidekick instructions",
    });

    const response = await get(workspace, template.sId);

    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain(
      "Published sidekick instructions"
    );
  });

  it("returns 404 for an unpublished template", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const template = await TemplateFactory.draft();
    await template.updateAttributes({
      sidekickInstructions: "Draft sidekick instructions",
    });

    const response = await get(workspace, template.sId);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("template_not_found");
  });
});
