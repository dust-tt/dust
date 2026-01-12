import { describe, expect, it } from "vitest";

import { preprocessInstructionBlocks } from "./InstructionBlock";

describe("preprocessInstructionBlocks", () => {
  it("converts simple instruction blocks", () => {
    const input = "<instructions>Some content</instructions>";
    const expected = ":::instruction_block[instructions]\nSome content\n:::\n";
    expect(preprocessInstructionBlocks(input)).toBe(expected);
  });

  it("handles custom tag names", () => {
    const input = "<my_custom_tag>Content here</my_custom_tag>";
    const expected = ":::instruction_block[my_custom_tag]\nContent here\n:::\n";
    expect(preprocessInstructionBlocks(input)).toBe(expected);
  });

  it("preserves multiline content", () => {
    const input = "<instructions>\nLine 1\nLine 2\n</instructions>";
    const expected =
      ":::instruction_block[instructions]\n\nLine 1\nLine 2\n\n:::\n";
    expect(preprocessInstructionBlocks(input)).toBe(expected);
  });

  it("handles multiple instruction blocks", () => {
    const input = "<tag1>Content 1</tag1>\n<tag2>Content 2</tag2>";
    const expected =
      ":::instruction_block[tag1]\nContent 1\n:::\n\n:::instruction_block[tag2]\nContent 2\n:::\n";
    expect(preprocessInstructionBlocks(input)).toBe(expected);
  });

  it("handles empty instruction blocks", () => {
    const input = "<empty></empty>";
    const expected = ":::instruction_block[empty]\n\n:::\n";
    expect(preprocessInstructionBlocks(input)).toBe(expected);
  });

  it("handles mixed content", () => {
    const input =
      "Regular text\n<instructions>Block content</instructions>\nMore text";
    const expected =
      "Regular text\n:::instruction_block[instructions]\nBlock content\n:::\n\nMore text";
    expect(preprocessInstructionBlocks(input)).toBe(expected);
  });

  it("preserves case in tag names", () => {
    const input = "<MyTag>Content</MyTag>";
    const expected = ":::instruction_block[MyTag]\nContent\n:::\n";
    expect(preprocessInstructionBlocks(input)).toBe(expected);
  });

  it("handles nested markdown in content", () => {
    const input = "<instructions>**bold** and `code`</instructions>";
    const expected =
      ":::instruction_block[instructions]\n**bold** and `code`\n:::\n";
    expect(preprocessInstructionBlocks(input)).toBe(expected);
  });

  it("handles tags with hyphens", () => {
    const input = "<my-custom-tag>Content</my-custom-tag>";
    const expected = ":::instruction_block[my-custom-tag]\nContent\n:::\n";
    expect(preprocessInstructionBlocks(input)).toBe(expected);
  });

  it("handles tags with dots", () => {
    const input = "<my.custom.tag>Content</my.custom.tag>";
    const expected = ":::instruction_block[my.custom.tag]\nContent\n:::\n";
    expect(preprocessInstructionBlocks(input)).toBe(expected);
  });

  it("handles tags with colons", () => {
    const input = "<my:custom:tag>Content</my:custom:tag>";
    const expected = ":::instruction_block[my:custom:tag]\nContent\n:::\n";
    expect(preprocessInstructionBlocks(input)).toBe(expected);
  });

  it("does not convert mismatched tags", () => {
    const input = "<tag1>Content</tag2>";
    // The regex requires matching tags, so this won't match
    expect(preprocessInstructionBlocks(input)).toBe(input);
  });

  it("handles content with line breaks and formatting", () => {
    const input = `<example>
# Heading

Some **bold** text and _italic_ text.

- List item 1
- List item 2
</example>`;
    const expected = `:::instruction_block[example]\n
# Heading

Some **bold** text and _italic_ text.

- List item 1
- List item 2
\n:::\n`;
    expect(preprocessInstructionBlocks(input)).toBe(expected);
  });
});
