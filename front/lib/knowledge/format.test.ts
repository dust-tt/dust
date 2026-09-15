import {
  parseKnowledgeTag,
  stripKnowledgeTagPresentationAttributes,
} from "@app/lib/knowledge/format";
import { describe, expect, it } from "vitest";

describe("parseKnowledgeTag", () => {
  it("parses the attributes serialized by KnowledgeNode.renderMarkdown", () => {
    expect(
      parseKnowledgeTag(
        '<knowledge id="notion-page-123" title="Quarterly Report" space="vlt_456" dsv="dsv_789" hasChildren="false" />'
      )
    ).toEqual({
      dataSourceViewId: "dsv_789",
      id: "notion-page-123",
      spaceId: "vlt_456",
      title: "Quarterly Report",
    });
  });

  it("parses missing or empty space and dsv as null", () => {
    expect(
      parseKnowledgeTag(
        '<knowledge id="notion-page-123" title="Quarterly Report" space="" dsv="" />'
      )
    ).toEqual({
      dataSourceViewId: null,
      id: "notion-page-123",
      spaceId: null,
      title: "Quarterly Report",
    });
  });

  it("rejects tags missing id or title", () => {
    expect(parseKnowledgeTag('<knowledge title="Quarterly Report" />')).toBe(
      null
    );
    expect(parseKnowledgeTag('<knowledge id="notion-page-123" />')).toBe(null);
    expect(
      parseKnowledgeTag(
        '<knowledge id="notion-page-123" title="Quarterly Report"></knowledge>'
      )
    ).toBe(null);
  });
});

describe("stripKnowledgeTagPresentationAttributes", () => {
  it("keeps only the title attribute", () => {
    expect(
      stripKnowledgeTagPresentationAttributes(
        'See <knowledge id="notion-page-123" title="Quarterly Report" space="vlt_456" dsv="dsv_789" hasChildren="false" /> for details.'
      )
    ).toBe('See <knowledge title="Quarterly Report" /> for details.');
  });
});
