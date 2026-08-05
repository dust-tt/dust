import { ActivationRecommendationResource } from "@app/lib/resources/activation_recommendation_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest() {
  const { workspace, auth } = await createPrivateApiMockRequest();
  return { workspace, auth };
}

function getRecommendations(wId: string) {
  return honoApp.request(`/api/w/${wId}/action-recommendations`);
}

function updateRecommendation(
  wId: string,
  recommendationId: string,
  body: {
    status?: "executed" | "dismissed";
    createdSkillId?: string;
    createdTriggerId?: string;
  }
) {
  return honoApp.request(
    `/api/w/${wId}/action-recommendations/${recommendationId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("GET /api/w/:wId/action-recommendations", () => {
  it("returns the user's suggested recommendations", async () => {
    const { workspace, auth } = await setupTest();

    const rec = await ActivationRecommendationResource.makeNew(auth, {
      content: "Automate your Monday meeting prep",
      title: "Next step",
      conversationId: null,
    });

    const response = await getRecommendations(workspace.sId);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.recommendations).toHaveLength(1);
    expect(body.recommendations[0]).toEqual({
      sId: rec.sId,
      title: "Next step",
      content: "Automate your Monday meeting prep",
      body: null,
      steps: null,
      ctaLabel: null,
      sourceIcon: null,
      sourceLabel: null,
      conversationId: null,
      createdAt: expect.any(Number),
    });
  });

  it("excludes dismissed recommendations", async () => {
    const { workspace, auth } = await setupTest();

    const rec = await ActivationRecommendationResource.makeNew(auth, {
      content: "Already handled",
      title: "Next step",
      conversationId: null,
    });
    await rec.updateFields({ status: "dismissed" });

    const response = await getRecommendations(workspace.sId);
    const body = await response.json();
    expect(body.recommendations).toHaveLength(0);
  });
});

describe("PATCH /api/w/:wId/action-recommendations/:recommendationId", () => {
  it("dismisses a recommendation so it no longer surfaces", async () => {
    const { workspace, auth } = await setupTest();

    const rec = await ActivationRecommendationResource.makeNew(auth, {
      content: "Scan Slack & Calendar for patterns",
      title: "Next step",
      conversationId: null,
    });

    const updateResponse = await updateRecommendation(workspace.sId, rec.sId, {
      status: "dismissed",
    });
    expect(updateResponse.status).toBe(200);
    const updateBody = await updateResponse.json();
    expect(updateBody).toEqual({ success: true });

    const getResponse = await getRecommendations(workspace.sId);
    const getBody = await getResponse.json();
    expect(getBody.recommendations).toHaveLength(0);
  });

  it("marks a recommendation as executed", async () => {
    const { workspace, auth } = await setupTest();

    const rec = await ActivationRecommendationResource.makeNew(auth, {
      content: "Set up your first automation",
      title: "Next step",
      conversationId: null,
    });

    const updateResponse = await updateRecommendation(workspace.sId, rec.sId, {
      status: "executed",
    });
    expect(updateResponse.status).toBe(200);
  });

  it("returns 404 for an unknown recommendation", async () => {
    const { workspace } = await setupTest();

    const response = await updateRecommendation(workspace.sId, "rec_unknown", {
      status: "dismissed",
    });
    expect(response.status).toBe(404);
  });
});
