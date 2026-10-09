import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/email", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@app/lib/api/email")>();
  const { Ok } = await import("@app/types/shared/result");
  return {
    ...mod,
    sendEmailWithTemplate: vi.fn().mockResolvedValue(new Ok(undefined)),
  };
});

vi.mock("@app/lib/utils/rate_limiter", () => ({
  rateLimiter: vi.fn().mockResolvedValue(10),
}));

import { sendEmailWithTemplate } from "@app/lib/api/email";
import { honoApp } from "@front-api/app";

describe("POST /api/w/:wId/mcp/request_access", () => {
  beforeEach(() => {
    vi.mocked(sendEmailWithTemplate).mockClear();
  });

  it("HTML-escapes the message in the email body", async () => {
    const { workspace, user, auth, globalSpace } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });
    const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
      name: "search",
      useCase: null,
    });
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.id,
        { mode: "metadata" }
      );
    assert(systemView, "System view should exist after server creation");
    const { view } = await MCPServerViewResource.create(auth, {
      systemView,
      space: globalSpace,
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/mcp/request_access`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mcpServerViewId: view.sId,
          emailMessage: `<script>alert("hi")</script> & 'thanks'`,
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(sendEmailWithTemplate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmailWithTemplate).mock.calls[0][0].body).toBe(
      `${user.email} has sent you a request regarding access to ` +
        `tools ${view.getDisplayName()}: ` +
        "&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt; &amp; &#39;thanks&#39;"
    );
  });
});
