import { makeMissingActionError } from "@app/lib/api/actions/servers/missing_action_catcher/tools";
import { describe, expect, it } from "vitest";

describe("makeMissingActionError", () => {
  it("reports the attempted action name", () => {
    const error = makeMissingActionError("github__search_repositories");

    expect(error.message).toContain(
      'Tool "github__search_repositories" not found.'
    );
  });

  it("caps long attempted action names", () => {
    const error = makeMissingActionError("a".repeat(300));
    const [firstLine] = error.message.split("\n");

    expect(firstLine).toContain(`Tool "${"a".repeat(253)}..." not found.`);
    expect(firstLine).not.toContain("a".repeat(254));
  });
});
