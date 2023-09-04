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
    const stringsSoupinou = [
      "Un",
      " petit",
      " Sou",
      "pin",
      "ou",
      " des",
      " bois",
      " [[",
      "idea",
      ":",
      "2",
      "]]",
    ];

    const fullTextSticious =
      "I’m not superstitious [[office_quote]], but I am a little stitious. [[office_quote]]";
    const stringsSticious = [
      "I",
      "’m",
      " not",
      " super",
      "stit",
      "ious",
      " [[",
      "office",
      "_quote",
      "]],",
      " but",
      " I",
      " am",
      " a",
      " little",
      " st",
      "itious",
      ".",
      " [[",
      "office",
      "_quote",
      "]]",
    ];

    const cases = [
      {
        fullText: fullTextSoupinou,
        marker: "[[idea:2]]",
        strings: stringsSoupinou,
        expected: { start: 7, end: 11 }, // main case
      },
      {
        fullText: fullTextSoupinou,
        marker: "[[idea]]",
        strings: stringsSoupinou,
        expected: { start: -1, end: -1 }, // not found
      },
      {
        fullText: fullTextSticious,
        marker: "[[office_quote]]",
        strings: stringsSticious,
        expected: { start: 6, end: 9 }, // takes the first one
      },
    ];
    cases.forEach((c) => {
      expect(
        findMarkersIndexes({
          fullText: c.fullText,
          marker: c.marker,
          strings: c.strings,
        })
      ).toEqual(c.expected);
    });
  });
});
