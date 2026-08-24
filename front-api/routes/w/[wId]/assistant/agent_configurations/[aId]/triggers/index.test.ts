import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("deprecated /api/w/:wId/assistant/agent_configurations/:aId/triggers", () => {
  it("redirects the collection to /triggers with aId as a query param", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/agent_configurations/agent123/triggers`,
      { redirect: "manual" }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `/api/w/${workspace.sId}/triggers?aId=agent123`
    );
  });

  it("redirects nested trigger paths, preserving method and body", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/agent_configurations/agent123/triggers/trg123/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "enabled" }),
        redirect: "manual",
      }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `/api/w/${workspace.sId}/triggers/trg123/status?aId=agent123`
    );
  });
});
