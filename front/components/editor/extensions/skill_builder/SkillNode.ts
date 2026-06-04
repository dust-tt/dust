import {
  parseSkillReferenceTag,
  SKILL_REFERENCE_TAG_REGEX_BEGINNING,
  SKILL_TAG_NAME,
  serializeSkillTag,
  serializeUnavailableSkillTag,
  UNAVAILABLE_SKILL_LABEL,
  UNAVAILABLE_SKILL_TAG_NAME,
} from "@app/lib/skills/format";
import { isString } from "@app/types/shared/utils/general";
import { Node } from "@tiptap/core";

export type SkillNodeAttributes = {
  skillId: string;
  skillIcon?: string | null;
  skillName: string;
  skillUnavailable?: boolean;
};

export const SKILL_NODE_TYPE = "skill";

const SKILL_CHIP_CLASS =
  "inline-flex items-center gap-0.5 border border-current/40 rounded px-0.5 text-xs leading-tight";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    skillNode: {
      insertSkillNode: (attrs: SkillNodeAttributes) => ReturnType;
    };
  }
}

// Schema-only skill reference node. Kept React-free (the interactive node view
// lives in SkillNodeWithView) so server-side code (e.g. skill_instructions_html)
// can register it without dragging the editor's React/TipTap node-view chain
// into the import graph.
// TODO(2026-05-02 aubin): Check whether we can share logic with KnowledgeNode,
// for example through a base extension.
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
      skillUnavailable: {
        default: false,
        parseHTML: (element) =>
          element.tagName.toLowerCase() === UNAVAILABLE_SKILL_TAG_NAME,
        // Encoded by the tag name (skill vs unavailable_skill), never as an
        // attribute. Without this, the static HTML renderer (server path) emits
        // a stray `skillunavailable="false"`; the client editor only avoided it
        // because its DOMPurify config drops all but id/name/icon.
        renderHTML: () => ({}),
      },
    };
  },

  // HTML serialization and deserialization.
  parseHTML() {
    return [{ tag: SKILL_TAG_NAME }, { tag: UNAVAILABLE_SKILL_TAG_NAME }];
  },

  renderHTML({ node, HTMLAttributes }) {
    // The chip span child is required, not cosmetic: the static HTML-string
    // renderer (server path) self-closes a childless custom element as
    // `<skill .../>`, and HTML5 parsers ignore self-closing on unknown tags, so
    // following text gets swallowed into the node. An explicit child forces a
    // properly closed `<skill ...>...</skill>`, matching ToolNode/KnowledgeNode.
    if (node.attrs.skillUnavailable === true) {
      return [
        UNAVAILABLE_SKILL_TAG_NAME,
        isString(node.attrs.skillId) ? { id: node.attrs.skillId } : {},
        ["span", { class: SKILL_CHIP_CLASS }, UNAVAILABLE_SKILL_LABEL],
      ];
    }

    const { skillName } = node.attrs;
    if (!isString(skillName)) {
      return ["span", {}];
    }

    return [
      SKILL_TAG_NAME,
      HTMLAttributes,
      ["span", { class: SKILL_CHIP_CLASS }, skillName],
    ];
  },

  renderText({ node }) {
    if (node.attrs.skillUnavailable === true) {
      return "/Unavailable skill";
    }

    return `/${node.attrs.skillName ?? "skill"}`;
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
    start: (src) => {
      const skillTagStart = src.indexOf(`<${SKILL_TAG_NAME}`);
      const unavailableSkillTagStart = src.indexOf(
        `<${UNAVAILABLE_SKILL_TAG_NAME}`
      );
      const starts = [skillTagStart, unavailableSkillTagStart].filter(
        (start) => start >= 0
      );

      return starts.length > 0 ? Math.min(...starts) : -1;
    },
    tokenize: (src) => {
      const match = SKILL_REFERENCE_TAG_REGEX_BEGINNING.exec(src);
      if (!match) {
        return undefined;
      }

      const skill = parseSkillReferenceTag(match[0]);
      if (!skill) {
        return undefined;
      }

      return {
        type: SKILL_NODE_TYPE,
        raw: match[0],
        skillId: skill.id,
        skillIcon: skill.icon,
        skillName: skill.name,
        skillUnavailable: skill.unavailable,
      };
    },
  },

  parseMarkdown: (token) => ({
    type: SKILL_NODE_TYPE,
    attrs: {
      skillId: token.skillId,
      skillIcon: token.skillIcon,
      skillName: token.skillName,
      skillUnavailable: token.skillUnavailable,
    },
  }),

  renderMarkdown: (node) => {
    if (!isString(node.attrs?.skillId)) {
      return "";
    }

    if (node.attrs.skillUnavailable === true) {
      return serializeUnavailableSkillTag({ id: node.attrs.skillId });
    }

    return isString(node.attrs?.skillName)
      ? serializeSkillTag({
          id: node.attrs.skillId,
          icon: isString(node.attrs.skillIcon) ? node.attrs.skillIcon : null,
          name: node.attrs.skillName,
        })
      : "";
  },
});
