import { describe, expect, it } from "vitest";

import {
  OPENAI_FORMATTING_META_PROMPT,
  OPENAI_FORMATTING_META_PROMPT_WITHOUT_PARAGRAPH_PREFERENCE,
  selectOpenAIFormattingMetaPrompt,
} from "./openai";

// The lines the `disable_paragraph_formatting_prompt` flag is meant to drop.
const PARAGRAPH_PREFERENCE_LINES = [
  "Default to clear narrative prose in connected, multi-sentence paragraphs",
  "Bullet or numbered lists are allowed only for brief, supporting enumerations",
  "Prefer paragraphs over lists for the main ideas of the answer.",
  "Return a response that is just a list of bullet points.",
];

// A few lines that must survive in both variants.
const RETAINED_LINES = [
  "Always respond using rich Markdown unless the user explicitly requests another format.",
  "Use Markdown headings (##, ###) to structure multi-paragraph answers into sections when helpful.",
  "Add headings or titles for trivial, one-line answers.",
];

describe("OPENAI_FORMATTING_META_PROMPT variants", () => {
  it("default prompt contains the paragraph-preference lines", () => {
    for (const line of PARAGRAPH_PREFERENCE_LINES) {
      expect(OPENAI_FORMATTING_META_PROMPT).toContain(line);
    }
  });

  it("variant drops every paragraph-preference line", () => {
    for (const line of PARAGRAPH_PREFERENCE_LINES) {
      expect(
        OPENAI_FORMATTING_META_PROMPT_WITHOUT_PARAGRAPH_PREFERENCE
      ).not.toContain(line);
    }
  });

  it("variant keeps the shared lines", () => {
    for (const line of RETAINED_LINES) {
      expect(
        OPENAI_FORMATTING_META_PROMPT_WITHOUT_PARAGRAPH_PREFERENCE
      ).toContain(line);
    }
  });
});

describe("selectOpenAIFormattingMetaPrompt", () => {
  it("returns the default prompt when the flag is off", () => {
    expect(
      selectOpenAIFormattingMetaPrompt(OPENAI_FORMATTING_META_PROMPT, {
        excludeParagraphPreference: false,
      })
    ).toBe(OPENAI_FORMATTING_META_PROMPT);
  });

  it("returns the stripped variant when the flag is on", () => {
    expect(
      selectOpenAIFormattingMetaPrompt(OPENAI_FORMATTING_META_PROMPT, {
        excludeParagraphPreference: true,
      })
    ).toBe(OPENAI_FORMATTING_META_PROMPT_WITHOUT_PARAGRAPH_PREFERENCE);
  });

  it("leaves a customized prompt untouched even when the flag is on", () => {
    const custom = "# Custom format\n- do whatever you want";
    expect(
      selectOpenAIFormattingMetaPrompt(custom, {
        excludeParagraphPreference: true,
      })
    ).toBe(custom);
  });

  it("passes undefined through unchanged", () => {
    expect(
      selectOpenAIFormattingMetaPrompt(undefined, {
        excludeParagraphPreference: true,
      })
    ).toBeUndefined();
  });
});
