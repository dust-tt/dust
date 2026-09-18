import { getSkillAvatarIcon } from "@app/lib/skill";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("skill listing avatars", () => {
  it.each([
    { sId: "go-deep", editedBy: null },
    { sId: "skl_custom", editedBy: 1 },
  ])("preserves the badge for $sId without an editor field", ({
    sId,
    editedBy,
  }) => {
    const listingIcon = getSkillAvatarIcon({ sId, icon: null });
    const fullSkillIcon = getSkillAvatarIcon({ editedBy, icon: null });
    expect(renderToStaticMarkup(createElement(listingIcon))).toBe(
      renderToStaticMarkup(createElement(fullSkillIcon))
    );
  });
});
