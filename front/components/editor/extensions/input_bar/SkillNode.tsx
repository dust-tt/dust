import { SkillNodeComponent } from "@app/components/editor/input_bar/SkillNodeComponent";
import {
  parseSkillTag,
  SKILL_TAG_NAME,
  SKILL_TAG_REGEX_BEGINNING,
  serializeSkillTag,
} from "@app/lib/skills/format";
import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export type SkillNodeAttributes = {
  skillId: string;
  skillName: string;
};

export const SKILL_NODE_TYPE = "skill";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    skillNode: {
      insertSkillNode: (attrs: SkillNodeAttributes) => ReturnType;
    };
  }
}

export const SkillNode = Node.create({
  name: SKILL_NODE_TYPE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      skillId: {
        default: null,
        parseHTML: (element) => element.getAttribute("id"),
        renderHTML: (attributes) =>
          typeof attributes.skillId === "string"
            ? { id: attributes.skillId }
            : {},
      },
      skillName: {
        default: null,
        parseHTML: (element) => element.getAttribute("name"),
        renderHTML: (attributes) =>
          typeof attributes.skillName === "string"
            ? { name: attributes.skillName }
            : {},
      },
    };
  },

  // HTML serialization and deserialization.
  parseHTML() {
    return [{ tag: SKILL_TAG_NAME }];
  },

  renderHTML({ HTMLAttributes }) {
    return [SKILL_TAG_NAME, HTMLAttributes];
  },

  renderText({ node }) {
    return `/${node.attrs.skillName ?? "skill"}`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(SkillNodeComponent);
  },

  addCommands() {
    return {
      insertSkillNode:
        (attrs: SkillNodeAttributes) =>
        ({ commands }) =>
          commands.insertContent([
            {
              type: SKILL_NODE_TYPE,
              attrs,
            },
            { type: "text", text: " " },
          ]),
    };
  },

  // Markdown serialization and deserialization.
  markdownTokenizer: {
    name: SKILL_NODE_TYPE,
    level: "inline",
    start: (src) => src.indexOf(`<${SKILL_TAG_NAME}`),
    tokenize: (src) => {
      const match = SKILL_TAG_REGEX_BEGINNING.exec(src);
      if (!match) {
        return undefined;
      }

      const skill = parseSkillTag(match[0]);
      if (!skill) {
        return undefined;
      }

      return {
        type: SKILL_NODE_TYPE,
        raw: match[0],
        skillId: skill.id,
        skillName: skill.name,
      };
    },
  },

  parseMarkdown: (token) => ({
    type: SKILL_NODE_TYPE,
    attrs: {
      skillId: token.skillId,
      skillName: token.skillName,
    },
  }),

  renderMarkdown: (node) =>
    serializeSkillTag({
      id: node.attrs?.skillId ?? "",
      name: node.attrs?.skillName ?? "",
    }),
});
