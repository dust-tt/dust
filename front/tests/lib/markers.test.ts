import { CoreAPITokenType } from "@dust-tt/types";

import {
  findMarkersIndexes,
  getRawExtractEventMarkersFromText,
  hasExtractEventMarker,
} from "@app/lib/extract_event_markers";

describe("Test hasExtractEventMarker", function () {
  test("returns true if there is a match", function () {
    expect(hasExtractEventMarker("Adopt a cat [[idea]]")).toEqual(true);
    expect(hasExtractEventMarker("[[goal]] Explore the moon")).toEqual(true);
    expect(hasExtractEventMarker("[[ to do ]] Watch a movie")).toEqual(true);
  });

  test("returns false when there is no match", function () {
    expect(hasExtractEventMarker("Adopt a cat [idea]]")).toEqual(false);
    expect(hasExtractEventMarker("[[goal] Explore the moon")).toEqual(false);
    expect(hasExtractEventMarker("{{todo}} Watch a movie")).toEqual(false);
  });
});

describe("Test getExtractEventMarker", function () {
  test("returns the marker's string in a list", function () {
    const cases = [
      {
        text: "Adopt a cat [[idea]]",
        markers: ["idea"],
      },
      {
        text: "[[goal]] Explore the moon",
        markers: ["goal"],
      },
      {
        text: "Watch a [[ to do ]] movie",
        markers: ["to do"],
      },
    ];
    cases.forEach((c) => {
      expect(getRawExtractEventMarkersFromText(c.text)).toEqual(c.markers);
    });
  });

  test("returns multiple markers if there are multiple", function () {
    const cases = [
      {
        text: "Adopt a cat [[idea]]. Adopt a dog [[idea2]]",
        markers: ["idea", "idea2"],
      },
      {
        text: "Adopt a cat [[idea]]. Adopt a dog [[idea]]",
        markers: ["idea", "idea"],
      },
    ];
    cases.forEach((c) => {
      expect(getRawExtractEventMarkersFromText(c.text)).toEqual(c.markers);
    });
  });

  test("returns empty [] when there is no marker", function () {
    const cases = [
      {
        text: "Adopt a cat [idea]]",
        markers: [],
      },
      {
        text: "[[goal] Explore the moon",
        markers: [],
      },
      {
        text: "{{todo}} Watch a movie",
        markers: [],
      },
    ];
    cases.forEach((c) => {
      expect(getRawExtractEventMarkersFromText(c.text)).toEqual(c.markers);
    });
  });
});

describe("Test findMarkerIndexes", function () {
  test("findMarkerIndexes", function () {
    const fullTextSoupinou = "Un petit Soupinou des bois [[idea:2]]";
    const tokensSoupinou: CoreAPITokenType[] = [
      [1844, "Un"],
      [46110, " petit"],
      [9424, " Sou"],
      [13576, "pin"],
      [283, "ou"],
      [951, " des"],
      [66304, " bois"],
      [4416, " [["],
      [42877, "idea"],
      [25, ":"],
      [17, "2"],
      [5163, "]]"],
    ];

    const fullTextSticious =
      "I’m not superstitious [[office_quote]] but I am a little stitious. [[office_quote]]";
    const tokensStitious: CoreAPITokenType[] = [
      [40, "I"],
      [4344, "’m"],
      [539, " not"],
      [2307, " super"],
      [3781, "stit"],
      [1245, "ious"],
      [4416, " [["],
      [27614, "office"],
      [46336, "_quote"],
      [21128, "]],"],
      [719, " but"],
      [358, " I"],
      [1097, " am"],
      [264, " a"],
      [2697, " little"],
      [357, " st"],
      [65795, "itious"],
      [13, "."],
      [4416, " [["],
      [27614, "office"],
      [46336, "_quote"],
      [5163, "]]"],
    ];

    const cases = [
      {
        fullText: fullTextSoupinou,
        marker: "[[idea:2]]",
        tokens: tokensSoupinou,
        expected: { start: 7, end: 11 }, // main case
      },
      {
        fullText: fullTextSoupinou,
        marker: "[[idea]]",
        tokens: tokensSoupinou,
        expected: { start: -1, end: -1 }, // not found
      },
      {
        fullText: fullTextSticious,
        marker: "[[office_quote]]",
        tokens: tokensStitious,
        expected: { start: 6, end: 9 }, // takes the first one
      },
    ];
    cases.forEach((c) => {
      expect(
        findMarkersIndexes({
          fullText: c.fullText,
          marker: c.marker,
          tokens: c.tokens,
        })
      ).toEqual(c.expected);
    });
  });
});
