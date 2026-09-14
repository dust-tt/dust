import { withFlexProcessing } from "@app/lib/api/llm/flex_processing";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { describe, expect, it } from "vitest";

const CONFIG: InputConfig = { reasoning: { effort: "medium" } };
const FLAGS = ["openai_flex_processing" as const];

describe("withFlexProcessing", () => {
  it.each<UserMessageOrigin>([
    "triggered",
    "triggered_programmatic",
    "wakeup",
  ])("requests flex processing for %s runs in flagged workspaces", (origin) => {
    expect(withFlexProcessing(CONFIG, FLAGS, origin)).toEqual({
      ...CONFIG,
      serviceTier: "flex",
    });
  });

  it.each<UserMessageOrigin | undefined>([
    "web",
    "slack",
    "api",
    undefined,
  ])("keeps the provider default for %s runs", (origin) => {
    expect(withFlexProcessing(CONFIG, FLAGS, origin)).toEqual(CONFIG);
  });

  it("keeps the provider default when the workspace is not flagged in", () => {
    expect(withFlexProcessing(CONFIG, [], "triggered")).toEqual(CONFIG);
  });
});
