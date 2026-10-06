import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  import("@app/lib/notifications/triggers/access-request"),
  async (importOriginal) => {
    const { Ok } = await import("@app/types/shared/result");
    return {
      ...(await importOriginal()),
      notifyAccessRequest: vi.fn().mockResolvedValue(new Ok(undefined)),
    };
  }
);

vi.mock("@app/lib/utils/rate_limiter", () => ({
  rateLimiter: vi.fn().mockResolvedValue(10),
}));

import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { notifyAccessRequest } from "@app/lib/notifications/triggers/access-request";
import { buildAccessRequestEmailCopy } from "@app/lib/notifications/workflows/access-request";
import { honoApp } from "@front-api/app";

describe("POST /api/w/:wId/data_sources/request_access", () => {
  beforeEach(() => {
    vi.mocked(notifyAccessRequest).mockClear();
  });

  it("sends the request through Novu and escapes it in the rendered email", async () => {
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
    expect(notifyAccessRequest).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyAccessRequest).mock.calls[0][0]).toMatchObject({
      workspaceId: workspace.sId,
      resourceKind: "data_source",
      resourceName: "Sales <R&D>",
      requesterEmail: user.email,
      message: `<script>alert("hi")</script> & 'thanks'`,
    });

    // The payload carries the raw text: the email template escapes it when rendering.
    const [[payload]] = vi.mocked(notifyAccessRequest).mock.calls;
    const i18n = await getNotificationI18n("en-US");
    const { content } = buildAccessRequestEmailCopy(i18n, payload);
    const body = await renderEmail({
      i18n,
      workspace: { id: workspace.sId, name: workspace.name },
      content,
    });
    expect(body).toContain(
      "&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt; &amp; &#x27;thanks&#x27;"
    );
    expect(body).not.toContain("<script>");
  });
});
