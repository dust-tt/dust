import { getToolCallDisplayLabel } from "@app/lib/api/assistant/tool_call_labels";
import { describe, expect, it } from "vitest";

describe("getToolCallDisplayLabel", () => {
  it("uses internal tool display labels when the server name is canonical", () => {
    expect(getToolCallDisplayLabel("common_utilities__wait")).toBe("Wait");
    expect(getToolCallDisplayLabel("data_sources_file_system__list")).toBe(
      "List data source contents"
    );
    expect(getToolCallDisplayLabel("data_sources_file_system__find")).toBe(
      "Find in data sources"
    );
    expect(
      getToolCallDisplayLabel(
        "interactive_content__create_interactive_content_file"
      )
    ).toBe("Create new Interactive Content file");
  });

  it("uses internal tool display labels for slugified server names", () => {
    expect(getToolCallDisplayLabel("web_search_browse__websearch")).toBe(
      "Web search"
    );
  });

  it("uses internal tool display labels when the server name has a collision prefix", () => {
    expect(getToolCallDisplayLabel("sales__github__get_pull_request")).toBe(
      "Retrieve GitHub pull request"
    );
  });

  it("uses default remote tool display labels when available", () => {
    expect(getToolCallDisplayLabel("linear__list_issues")).toBe(
      "List issues on Linear"
    );
  });

  it("falls back to formatting the raw function call name", () => {
    expect(getToolCallDisplayLabel("custom_server__do_thing")).toBe(
      "Custom Server Do Thing"
    );
  });
});
