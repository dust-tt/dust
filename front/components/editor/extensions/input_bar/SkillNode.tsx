import { SkillNodeComponent } from "@app/components/editor/input_bar/SkillNodeComponent";
import {
  parseSkillTag,
  SKILL_TAG_NAME,
  SKILL_TAG_REGEX_BEGINNING,
  serializeSkillTag,
} from "@app/lib/skills/format";
import { isString } from "@app/types/shared/utils/general";
import { Node } from "@tiptap/core";
import type { ReactNodeViewProps } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type React from "react";

export type SkillNodeAttributes = {
  skillId?: string | null;
  skillIcon?: string | null;
  skillName?: string | null;
  skillSerializeIcon?: boolean | null;
};

export const SKILL_NODE_TYPE = "skill";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    skillNode: {
      insertSkillNode: (attrs?: SkillNodeAttributes) => ReturnType;
    };
  }
}

export interface SkillNodeOptions {
  insertTrailingSpace: boolean;
  nodeView: React.ComponentType<ReactNodeViewProps> | null;
}

// TODO(2026-05-02 aubin): Check whether we can share logic with KnowledgeNode,
// for example through a base extension.
export const SkillNode = Node.create<SkillNodeOptions>({
  addOptions() {
    return {
      insertTrailingSpace: true,
      nodeView: null,
    };
  },

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
      skillSerializeIcon: {
        default: true,
        parseHTML: (element) => element.hasAttribute("icon"),
        renderHTML: () => ({}),
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
    return ReactNodeViewRenderer(this.options.nodeView ?? SkillNodeComponent);
  },

  addCommands() {
    return {
      insertSkillNode:
        (attrs: SkillNodeAttributes = {}) =>
        ({ commands }) => {
          const node = {
            type: SKILL_NODE_TYPE,
            attrs,
          };

          return commands.insertContent(
            this.options.insertTrailingSpace
              ? [node, { type: "text", text: " " }]
              : node,
          );
        },
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
        skillSerializeIcon: skill.icon !== null,
      };
    },
  },

  parseMarkdown: (token) => ({
    type: SKILL_NODE_TYPE,
    attrs: {
      skillId: token.skillId,
      skillIcon: token.skillIcon,
      skillName: token.skillName,
      skillSerializeIcon: token.skillSerializeIcon,
    },
  }),

  renderMarkdown(node) {
    if (!isString(node.attrs?.skillId) || !isString(node.attrs?.skillName)) {
      return "";
    }

    return serializeSkillTag({
      id: node.attrs.skillId,
      icon:
        node.attrs.skillSerializeIcon !== false &&
        isString(node.attrs.skillIcon)
          ? node.attrs.skillIcon
          : null,
      name: node.attrs.skillName,
    });
  },
});
