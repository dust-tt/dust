import { SkillNodeComponent } from "@app/components/editor/input_bar/SkillNodeComponent";
import {
  parseSkillTag,
  SKILL_TAG_NAME,
  SKILL_TAG_REGEX_BEGINNING,
  serializeSkillTag,
} from "@app/lib/skills/format";
import { isString } from "@app/types/shared/utils/general";
import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export type SkillNodeAttributes = {
  skillId: string;
  skillIcon?: string | null;
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
          isString(attributes.skillId) ? { id: attributes.skillId } : {},
      },
      skillName: {
        default: null,
        parseHTML: (element) => element.getAttribute("name"),
        renderHTML: (attributes) =>
          isString(attributes.skillName) ? { name: attributes.skillName } : {},
      },
      skillIcon: {
        default: null,
        parseHTML: (element) => element.getAttribute("icon"),
        renderHTML: (attributes) =>
          isString(attributes.skillIcon) ? { icon: attributes.skillIcon } : {},
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
        skillIcon: skill.icon,
        skillName: skill.name,
      };
    },
  },

  parseMarkdown: (token) => ({
    type: SKILL_NODE_TYPE,
    attrs: {
      skillId: token.skillId,
      skillIcon: token.skillIcon,
      skillName: token.skillName,
    },
  }),

  renderMarkdown: (node) =>
    serializeSkillTag({
      id: node.attrs?.skillId ?? "",
      icon: node.attrs?.skillIcon ?? null,
      name: node.attrs?.skillName ?? "",
    }),
});
