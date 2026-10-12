import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { buildAccessRequestEmailCopy } from "@app/lib/notifications/workflows/access-request";
import { describe, expect, it } from "vitest";

describe("buildAccessRequestEmailCopy", () => {
  it("includes the message and lets the editor reply to the requester", async () => {
    const copy = buildAccessRequestEmailCopy(
      await getNotificationI18n("en-US"),
      {
        resourceKind: "mcp_server",
        resourceName: "Jira",
        requesterName: "Ada",
        requesterEmail: "ada@example.com",
        message: "I need it for triage.",
      }
    );

    expect(copy.subject).toBe("[Dust] Ada requests access to the Jira tools");
    expect(copy.content).toContain("I need it for triage.");
    expect(copy.action?.url).toBe("mailto:ada@example.com");
  });
});
