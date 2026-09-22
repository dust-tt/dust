import type { Attributes } from "@tiptap/core";
import { CodeBlock } from "@tiptap/extension-code-block";
import { Heading } from "@tiptap/extension-heading";
import { OrderedList } from "@tiptap/extension-ordered-list";
import { z } from "zod";

const MAX_CODE_LANGUAGE_LENGTH = 100;
const headingLevel = z.number().int().min(1).max(6);
const listStart = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const listType = z.enum(["1", "a", "A", "i", "I"]).nullable();
const codeLanguage = z
  .string()
  .min(1)
  .max(MAX_CODE_LANGUAGE_LENGTH)
  .regex(/^[\w.+#-]+$/)
  .nullable();

export const DocumentHeading = Heading.extend({
  addAttributes() {
    const attributes: Attributes = this.parent?.() ?? {};
    return {
      ...attributes,
      level: { ...attributes.level, validate: headingLevel.parse },
    };
  },
});

export const DocumentOrderedList = OrderedList.extend({
  addAttributes() {
    const attributes: Attributes = this.parent?.() ?? {};
    return {
      ...attributes,
      start: { ...attributes.start, validate: listStart.parse },
      type: { ...attributes.type, validate: listType.parse },
    };
  },
});

export const DocumentCodeBlock = CodeBlock.extend({
  addAttributes() {
    const attributes: Attributes = this.parent?.() ?? {};
    return {
      ...attributes,
      language: { ...attributes.language, validate: codeLanguage.parse },
    };
  },
});
