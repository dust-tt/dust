import { inferProjectTaskSourceFromUrl } from "@app/lib/api/actions/servers/pod_tasks/source_utils";
import { describe, expect, it } from "vitest";

describe("inferProjectTaskSourceFromUrl", () => {
  it("detects Dust conversation URLs", () => {
    const source = inferProjectTaskSourceFromUrl({
      url: "https://dust.tt/w/ws123/conversation/conv456",
      title: "Kickoff",
    });
    expect(source).toEqual({
      sourceType: "project_conversation",
      sourceId: "conv456",
      sourceTitle: "Kickoff",
      sourceUrl: "https://dust.tt/w/ws123/conversation/conv456",
    });
  });

  it("detects Slack URLs", () => {
    const source = inferProjectTaskSourceFromUrl({
      url: "https://dusthq.slack.com/archives/C123/p456",
      title: "Thread",
    });
    expect(source.sourceType).toBe("slack");
    expect(source.sourceId).toBe("https://dusthq.slack.com/archives/C123/p456");
  });

  it("detects GitHub URLs", () => {
    const source = inferProjectTaskSourceFromUrl({
      url: "https://github.com/dust-tt/dust/issues/123",
      title: "Issue #123",
    });
    expect(source.sourceType).toBe("github");
  });

  it("falls back to project_knowledge for unknown URLs", () => {
    const source = inferProjectTaskSourceFromUrl({
      url: "https://example.com/doc",
      title: "Doc",
    });
    expect(source.sourceType).toBe("project_knowledge");
  });
});
