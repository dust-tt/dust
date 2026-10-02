import { getSkillAvatarIcon } from "@app/lib/skill";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("skill listing avatars", () => {
  it.each([
    { sId: "go-deep", editedBy: null },
    { sId: "skl_custom", editedBy: 1 },
  ])("preserves the badge for $sId with a string editor ID", ({
    sId,
    editedBy,
  }) => {
    const fullSkill = { sId, editedBy, icon: null };
    const listingIcon = getSkillAvatarIcon({
      editedBy: editedBy === null ? null : "user_1",
      icon: null,
    });
    const fullSkillIcon = getSkillAvatarIcon(fullSkill);
    const settingsIcon = getSkillAvatarIcon({
      isDustProvided: editedBy === null,
      icon: null,
    });
    expect(renderToStaticMarkup(createElement(listingIcon))).toBe(
      renderToStaticMarkup(createElement(fullSkillIcon))
    );
    expect(renderToStaticMarkup(createElement(settingsIcon))).toBe(
      renderToStaticMarkup(createElement(fullSkillIcon))
    );
  });
});
