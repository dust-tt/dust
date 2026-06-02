import {
  SkillNode,
  type SkillNodeAttributes,
} from "@app/components/editor/extensions/input_bar/SkillNode";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";
import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SKILL_ATTRS: SkillNodeAttributes = {
  skillIcon: "DustLogo",
  skillId: "skill_123",
  skillName: "Create Frames",
};

function skillNodes(editor: Editor) {
  const nodes: { attrs?: SkillNodeAttributes; type: string }[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "skill") {
      nodes.push({
        attrs: {
          skillIcon: node.attrs.skillIcon,
          skillId: node.attrs.skillId,
          skillName: node.attrs.skillName,
          skillUnavailable: node.attrs.skillUnavailable,
        },
        type: node.type.name,
      });
    }
  });
  return nodes;
}

describe("SkillNode", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([SkillNode]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("removes a skill node with backspace", () => {
    editor.commands.insertSkillNode(SKILL_ATTRS);

    let skillNodeEnd: number | null = null;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === "skill") {
        skillNodeEnd = position + node.nodeSize;
        return false;
      }

      return true;
    });

    if (skillNodeEnd === null) {
      throw new Error("Skill node not found");
    }

    editor.commands.setTextSelection(skillNodeEnd);
    editor.commands.keyboardShortcut("Backspace");

    expect(skillNodes(editor)).toEqual([]);
  });
});
