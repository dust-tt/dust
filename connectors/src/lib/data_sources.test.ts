import type { DataSourceConfig } from "@connectors/types/data_source_config";
import { Ok } from "@dust-tt/client";
import { describe, expect, it, vi } from "vitest";

import type { CoreAPIDataSourceDocumentSection } from "./data_sources";
import {
  MAX_CHUNK_SIZE,
  MAX_HEADING_PREFIX_TOKENS,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  sectionLength,
  truncateSection,
} from "./data_sources";

// One token per character, so token budgets translate directly to string lengths.
vi.mock("@connectors/lib/api/dust_api", () => ({
  getDustAPI: () => ({
    tokenize: async (text: string) =>
      new Ok([...text].map((c, i): [number, string] => [i, c])),
  }),
}));

const dataSourceConfig: DataSourceConfig = {
  workspaceAPIKey: "key",
  workspaceId: "ws",
  dataSourceId: "ds",
};

function onlyChild(
  section: CoreAPIDataSourceDocumentSection
): CoreAPIDataSourceDocumentSection {
  expect(section.sections).toHaveLength(1);
  const [child] = section.sections;
  if (!child) {
    throw new Error("Unreachable");
  }
  return child;
}

// Largest prefix total over all root-to-leaf paths, which is what core checks.
function maxStackedPrefixTokens(
  node: CoreAPIDataSourceDocumentSection
): number {
  const own = node.prefix?.length ?? 0;
  return own + Math.max(0, ...node.sections.map(maxStackedPrefixTokens));
}

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

describe("renderMarkdownSection", () => {
  it("should truncate heading prefixes to MAX_HEADING_PREFIX_TOKENS", async () => {
    const heading = "x".repeat(MAX_HEADING_PREFIX_TOKENS * 2);
    const section = await renderMarkdownSection(
      dataSourceConfig,
      `# ${heading}\n\nbody`
    );

    const h1 = onlyChild(section);
    expect(h1.prefix).toEqual(
      `# ${heading}`.slice(0, MAX_HEADING_PREFIX_TOKENS) + "...\n"
    );
    expect(h1.content).toEqual(
      "..." + `# ${heading}\n`.slice(MAX_HEADING_PREFIX_TOKENS)
    );
    expect(h1.sections.map((s) => s.content)).toEqual(["body\n"]);
  });

  it("should keep short heading prefixes intact", async () => {
    const section = await renderMarkdownSection(
      dataSourceConfig,
      "# Title\n\n## Sub\n\nbody"
    );

    const h1 = onlyChild(section);
    expect(h1.prefix).toEqual("# Title\n");
    expect(h1.content).toBeNull();
    expect(onlyChild(h1).prefix).toEqual("## Sub\n");
  });

  it("should keep stacked prefixes under half the chunk size", async () => {
    const long = "x".repeat(MAX_CHUNK_SIZE);
    const section = await renderDocumentTitleAndContent({
      dataSourceConfig,
      title: long,
      createdAt: new Date("2026-09-24T07:49:44.855Z"),
      updatedAt: new Date("2026-09-24T07:49:44.855Z"),
      content: await renderMarkdownSection(
        dataSourceConfig,
        `# ${long}\n\n## ${long}\n\nbody`
      ),
    });

    expect(maxStackedPrefixTokens(section)).toBeLessThan(MAX_CHUNK_SIZE / 2);
  });
});
