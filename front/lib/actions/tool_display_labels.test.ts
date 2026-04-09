import {
  getToolDisplayLabels,
  getStaticToolDisplayLabelsFromFunctionCallName,
  getToolNameFromFunctionCallName,
} from "@app/lib/actions/tool_display_labels";
import { describe, expect, it } from "vitest";

describe("getToolNameFromFunctionCallName", () => {
  it("extracts the unprefixed tool name", () => {
    expect(
      getToolNameFromFunctionCallName("sales__github__get_pull_request")
    ).toBe("get_pull_request");
  });

  it("falls back to the raw function call name when it is not prefixed", () => {
    expect(getToolNameFromFunctionCallName("search_company")).toBe(
      "search_company"
    );
  });
});

describe("getToolDisplayLabels", () => {
  it("resolves labels for internal tools", () => {
    expect(
      getToolDisplayLabels({
        internalMCPServerName: "common_utilities",
        toolName: "wait",
        inputs: {},
      })
    ).toEqual({
      running: "Waiting",
      done: "Wait",
    });
  });

  it("resolves labels for default remote tools", () => {
    expect(
      getToolDisplayLabels({
        mcpServerName: "Linear",
        toolName: "list_issues",
        inputs: {},
      })
    ).toEqual({
      running: "Listing issues on Linear",
      done: "List issues on Linear",
    });
  });
});

describe("getStaticToolDisplayLabelsFromFunctionCallName", () => {
  it("resolves labels from a prefixed function call name", () => {
    expect(
      getStaticToolDisplayLabelsFromFunctionCallName(
        "interactive_content__create_interactive_content_file"
      )
    ).toEqual({
      running: "Creating new Interactive Content file",
      done: "Create new Interactive Content file",
    });
  });

  it("resolves labels when the server name has a collision prefix", () => {
    expect(
      getStaticToolDisplayLabelsFromFunctionCallName(
        "sales__github__get_pull_request"
      )
    ).toEqual({
      running: "Retrieving GitHub pull request",
      done: "Retrieve GitHub pull request",
    });
  });
});
