import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getUserTriggers(wId: string) {
  return honoApp.request(`/api/w/${wId}/me/triggers`);
}

const EVERY_MONDAY_9AM = {
  cron: "0 9 * * 1",
  timezone: "Europe/Paris",
};

describe("GET /api/w/:wId/me/triggers", () => {
  it("lists a trigger on a deprecated (model-only) global agent such as gemini-pro", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();

    await TriggerFactory.schedule(auth, {
      name: "Weekly gemini digest",
      agentConfigurationId: GLOBAL_AGENTS_SID.GEMINI_PRO,
      configuration: EVERY_MONDAY_9AM,
    });

    const response = await getUserTriggers(workspace.sId);
    expect(response.status).toBe(200);

    const { triggers } = await response.json();
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toMatchObject({
      name: "Weekly gemini digest",
      agentConfigurationId: GLOBAL_AGENTS_SID.GEMINI_PRO,
      agentName: "gemini-pro",
      isEditor: true,
    });
    expect(triggers[0].agentPictureUrl).toBeTruthy();
  });
});
