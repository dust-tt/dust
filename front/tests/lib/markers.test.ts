import {
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
