import { classifyStakeOrFrameTool } from "@app/lib/api/activation/stake_and_frame_classification";
import { describe, expect, it } from "vitest";

describe("classifyStakeOrFrameTool", () => {
  it("classifies frame creation regardless of tool/stake", () => {
    // interactive_content tools are all never_ask, so frames rely on this
    // override rather than the stake rule.
    expect(classifyStakeOrFrameTool("interactive_content", "anything")).toBe(
      "IS_CREATE_FRAME"
    );
  });

  it("classifies a consequential internal tool (stake != never_ask) as staked", () => {
    // gmail/create_draft has stake "medium".
    expect(classifyStakeOrFrameTool("gmail", "create_draft")).toBe("IS_STAKE");
  });

  it("does not classify a never_ask read tool", () => {
    // gmail/get_drafts has stake "never_ask".
    expect(classifyStakeOrFrameTool("gmail", "get_drafts")).toBeNull();
  });

  it("never classifies custom/remote tools (server not internal)", () => {
    expect(
      classifyStakeOrFrameTool("some_remote_mcp_server", "create_thing")
    ).toBeNull();
  });

  it("does not guess on unknown internal tools", () => {
    expect(
      classifyStakeOrFrameTool("gmail", "tool_that_does_not_exist")
    ).toBeNull();
  });
});
