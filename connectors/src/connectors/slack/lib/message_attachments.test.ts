import { splitSlackAttachments } from "@connectors/connectors/slack/lib/message_attachments";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";
import { describe, expect, it } from "vitest";

describe("splitSlackAttachments", () => {
  it("partitions unfurl and non-unfurl, rendering each forwarded message once", () => {
    const attachments: MessageElement["attachments"] = [
      {
        is_msg_unfurl: true,
        author_name: "alice",
        text: "deploy of tax-service failed at 09:00",
      },
      { title: "Grafana", text: "alert body" },
    ];

    const { nonUnfurlAttachments, forwardedMessagesText } =
      splitSlackAttachments(attachments);

    // The non-unfurl attachment goes to the formatter path.
    expect(nonUnfurlAttachments).toHaveLength(1);
    expect(nonUnfurlAttachments?.[0]?.title).toBe("Grafana");

    // The unfurl attachment is rendered by the forwarded path, exactly once.
    expect(forwardedMessagesText).toContain("Forwarded from @alice:");
    const occurrences = forwardedMessagesText.match(
      /deploy of tax-service failed at 09:00/g
    );
    expect(occurrences).toHaveLength(1);
    // ...and it does not leak into the non-unfurl side.
    expect(forwardedMessagesText).not.toContain("alert body");
  });

  it("skips unfurl attachments that carry no usable text", () => {
    const attachments: MessageElement["attachments"] = [
      { is_msg_unfurl: true, author_name: "bob", text: "   " },
    ];

    const { forwardedMessagesText } = splitSlackAttachments(attachments);

    expect(forwardedMessagesText).toBe("");
  });
});
