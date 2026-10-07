import { pseudoLocalizeMessages } from "@app/lib/i18n/pseudo_locale";
import { describe, expect, it } from "vitest";

describe("pseudoLocalizeMessages", () => {
  it("accents and brackets text, keeping placeholders, plurals and tags", () => {
    const messages = pseudoLocalizeMessages({
      save: ["Save"],
      tag: ["Details <0>here</0> for ", ["name"], " at 50% off"],
      price: [["price", "number", "currency"]],
      days: [
        [
          "count",
          "plural",
          { offset: undefined, one: ["#", " day"], other: ["#", " days"] },
        ],
      ],
    });

    expect(messages).toEqual({
      save: ["[", "Śàvē", "]"],
      tag: ["[", "Ďēţàĩĺś <0>ĥēŕē</0> ƒōŕ ", ["name"], " àţ 50% ōƒƒ", "]"],
      price: ["[", ["price", "number", "currency"], "]"],
      days: [
        "[",
        [
          "count",
          "plural",
          { offset: undefined, one: ["#", " ďàŷ"], other: ["#", " ďàŷś"] },
        ],
        "]",
      ],
    });
  });
});
