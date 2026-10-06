import {
  buildSlashCommandSections,
  someSectionShowsOwnState,
} from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { RUN_COMMAND_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { describe, expect, it } from "vitest";

const row: SlashCommand = {
  action: RUN_COMMAND_SLASH_COMMAND_ACTION,
  data: {},
  description: "",
  icon: () => null,
  id: "row",
  label: "Row",
};

describe("someSectionShowsOwnState", () => {
  it("is true for an empty section that loads or carries an empty message", () => {
    expect(
      someSectionShowsOwnState([{ label: "A", items: [], isLoading: true }])
    ).toBe(true);
    expect(
      someSectionShowsOwnState([{ label: "A", items: [], emptyMessage: "-" }])
    ).toBe(true);
  });

  it("is false for sections with rows or with nothing to show", () => {
    expect(someSectionShowsOwnState([{ label: "A", items: [row] }])).toBe(
      false
    );
    expect(someSectionShowsOwnState([{ label: "A", items: [] }])).toBe(false);
    expect(
      someSectionShowsOwnState(
        buildSlashCommandSections({ commandItems: [], capabilityItems: [] })
      )
    ).toBe(false);
  });
});
