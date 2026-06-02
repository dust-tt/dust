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

function getSkillNodePosition(editor: Editor) {
  const skillNodePositions: { nodeSize: number; position: number }[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "skill") {
      skillNodePositions.push({
        nodeSize: node.nodeSize,
        position,
      });
      return false;
    }

    return true;
  });

  const skillNodePosition = skillNodePositions[0];
  if (!skillNodePosition) {
    throw new Error("Skill node not found");
  }

  return skillNodePosition;
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
    const skillNodePosition = getSkillNodePosition(editor);

    editor.commands.setTextSelection(
      skillNodePosition.position + skillNodePosition.nodeSize
    );
    editor.commands.keyboardShortcut("Backspace");

    expect(skillNodes(editor)).toEqual([]);
  });

  it("removes a skill node with delete", () => {
    editor.commands.insertSkillNode(SKILL_ATTRS);
    const skillNodePosition = getSkillNodePosition(editor);

    editor.commands.setTextSelection(skillNodePosition.position);
    editor.commands.keyboardShortcut("Delete");

    expect(skillNodes(editor)).toEqual([]);
  });
});
