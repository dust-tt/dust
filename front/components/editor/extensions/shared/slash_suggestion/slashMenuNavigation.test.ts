import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import {
  ATTACH_CONTEXT_QUERY_PLACEHOLDER,
  ATTACH_CONTEXT_SUB_MENU_ID,
  getSlashSubMenuQueryPlaceholder,
  PICK_MODEL_SUB_MENU_ID,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import { describe, expect, it } from "vitest";

const command: SlashCommand = {
  action: "noop",
  icon: () => null,
  id: "cmd",
  label: "Command",
};

describe("getSlashSubMenuQueryPlaceholder", () => {
  it("shows the search hint only inside the attach sub-menu", () => {
    expect(getSlashSubMenuQueryPlaceholder({ menuStack: [] })).toBeNull();
    expect(
      getSlashSubMenuQueryPlaceholder({
        menuStack: [{ command, subMenuId: PICK_MODEL_SUB_MENU_ID }],
      })
    ).toBeNull();
    expect(
      getSlashSubMenuQueryPlaceholder({
        menuStack: [{ command, subMenuId: ATTACH_CONTEXT_SUB_MENU_ID }],
      })
    ).toBe(ATTACH_CONTEXT_QUERY_PLACEHOLDER);
  });
});
