import type { CoreAPIDataSourceDocumentSection } from "@dust-tt/types";
import { describe, expect, it } from "vitest";

import { sectionLength, truncateSection } from "./data_sources";

describe("truncateSection", () => {
  it("should return unchanged section if within length limit", () => {
    const section: CoreAPIDataSourceDocumentSection = {
      prefix: "Hello",
      content: "World",
      sections: [],
    };
    const result = truncateSection(section, 20);
    expect(result).toEqual(section);
    expect(sectionLength(result)).toEqual(10);
  });

  it("should truncate content of a simple section", () => {
    const section: CoreAPIDataSourceDocumentSection = {
      prefix: "Hello",
      content: "World",
      sections: [],
    };
    const result = truncateSection(section, 8);
    expect(result).toEqual({
      prefix: "Hello",
      content: "Wor",
      sections: [],
    });
    expect(sectionLength(result)).toEqual(8);
  });

  it("should truncate prefix if content truncation is not enough", () => {
    const section: CoreAPIDataSourceDocumentSection = {
      prefix: "Hello",
      content: "World",
      sections: [],
    };
    const result = truncateSection(section, 3);
    expect(result).toEqual({
      prefix: "Hel",
      content: "",
      sections: [],
    });
    expect(sectionLength(result)).toEqual(3);
  });

  it("should handle nested sections", () => {
    const section: CoreAPIDataSourceDocumentSection = {
      prefix: "Parent",
      content: "Content",
      sections: [
        {
          prefix: "Child1",
          content: "Content1",
          sections: [],
        },
        {
          prefix: "Child2",
          content: "Content2",
          sections: [],
        },
      ],
    };
    const result = truncateSection(section, 20);
    expect(result).toEqual({
      prefix: "Parent",
      content: "Content",
      sections: [
        {
          prefix: "Child1",
          content: "C",
          sections: [],
        },
      ],
    });
    expect(sectionLength(result)).toEqual(20);
  });

  it("should handle deeply nested sections", () => {
    const section: CoreAPIDataSourceDocumentSection = {
      prefix: "Level1",
      content: "Content1",
      sections: [
        {
          prefix: "Level2",
          content: "Content2",
          sections: [
            {
              prefix: "Level3",
              content: "Content3",
              sections: [],
            },
          ],
        },
      ],
    };
    const result = truncateSection(section, 30);
    expect(result).toEqual({
      prefix: "Level1",
      content: "Content1",
      sections: [
        {
          prefix: "Level2",
          content: "Content2",
          sections: [
            {
              prefix: "Le",
              content: "",
              sections: [],
            },
          ],
        },
      ],
    });
    expect(sectionLength(result)).toEqual(30);
  });

  it("should remove empty sections after truncation", () => {
    const section: CoreAPIDataSourceDocumentSection = {
      prefix: "Parent",
      content: "Content",
      sections: [
        {
          prefix: "Child1",
          content: "Content1",
          sections: [],
        },
        {
          prefix: "Child2",
          content: "Content2",
          sections: [],
        },
      ],
    };
    const result = truncateSection(section, 15);
    expect(result).toEqual({
      prefix: "Parent",
      content: "Content",
      sections: [
        {
          prefix: "Ch",
          content: "",
          sections: [],
        },
      ],
    });
    expect(sectionLength(result)).toEqual(15);
  });

  it("should handle sections with only prefixes", () => {
    const section: CoreAPIDataSourceDocumentSection = {
      prefix: "Parent",
      content: null,
      sections: [
        {
          prefix: "Child1",
          content: null,
          sections: [],
        },
        {
          prefix: "Child2",
          content: null,
          sections: [],
        },
      ],
    };
    const result = truncateSection(section, 15);
    expect(result).toEqual({
      prefix: "Parent",
      content: null,
      sections: [
        {
          prefix: "Child1",
          content: null,
          sections: [],
        },
        {
          prefix: "Chi",
          content: null,
          sections: [],
        },
      ],
    });
    expect(sectionLength(result)).toEqual(15);
  });

  it("should handle sections with only content", () => {
    const section: CoreAPIDataSourceDocumentSection = {
      prefix: null,
      content: "ParentContent",
      sections: [
        {
          prefix: null,
          content: "Child1Content",
          sections: [],
        },
        {
          prefix: null,
          content: "Child2Content",
          sections: [],
        },
      ],
    };
    const result = truncateSection(section, 15);
    expect(result).toEqual({
      prefix: null,
      content: "ParentContent",
      sections: [
        {
          prefix: null,
          content: "Ch",
          sections: [],
        },
      ],
    });
    expect(sectionLength(result)).toEqual(15);
  });

  it("should not mutate the original section", () => {
    const section: CoreAPIDataSourceDocumentSection = {
      prefix: "Hello",
      content: "World",
      sections: [],
    };
    const originalSection = { ...section };
    const result = truncateSection(section, 8);
    expect(section).toEqual(originalSection);
    expect(sectionLength(section)).toEqual(10);
    expect(sectionLength(result)).toEqual(8);
  });
});
