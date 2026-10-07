import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
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

describe("POST /api/w/:wId/data_sources/request_access", () => {
  beforeEach(() => {
    vi.mocked(sendEmailWithTemplate).mockClear();
  });

  it("HTML-escapes the connection name and message in the email body", async () => {
    const { workspace, user, globalSpace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const view = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      user
    );
    await DataSourceModel.update(
      { name: "Sales <R&D>" },
      { where: { id: view.dataSource.id, workspaceId: workspace.id } }
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/data_sources/request_access`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataSourceId: view.dataSource.sId,
          emailMessage: `<script>alert("hi")</script> & 'thanks'`,
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(sendEmailWithTemplate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmailWithTemplate).mock.calls[0][0].body).toBe(
      `${user.email} has sent you a request regarding access to connection ` +
        "Sales &lt;R&amp;D&gt;: " +
        "&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt; &amp; &#39;thanks&#39;"
    );
  });
});
