import {
  ATTACH_CONTEXT_SUB_MENU_ID,
  getActiveSlashSubMenuFrame,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import { Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import {
  SlashCommandExtension,
  slashCommandPluginKey,
} from "./SlashCommandExtension";

describe("SlashCommandExtension", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  function createEditor() {
    editor = new Editor({
      extensions: [
        StarterKit,
        SlashCommandExtension.configure({
          onSelectRef: { current: undefined },
        }),
      ],
    });

    return editor;
  }

  it("opens attach knowledge sub-menu after marked text", () => {
    const editor = createEditor();
    editor.commands.setContent("<p><em>Italic text</em></p>");
    editor.commands.focus("end");

    editor.commands.openAttachKnowledgeSlashCommand();

    expect(editor.getText()).toBe("Italic text/");
    expect(
      getActiveSlashSubMenuFrame(editor.storage.slashCommand)?.subMenuId
    ).toBe(ATTACH_CONTEXT_SUB_MENU_ID);
  });

  it("opens attach knowledge sub-menu after regular text", () => {
    const editor = createEditor();
    editor.commands.setContent("<p>regular text</p>");
    editor.commands.focus("end");

    editor.commands.openAttachKnowledgeSlashCommand();

    expect(editor.getText()).toBe("regular text/");
    expect(
      getActiveSlashSubMenuFrame(editor.storage.slashCommand)?.subMenuId
    ).toBe(ATTACH_CONTEXT_SUB_MENU_ID);
  });

  it("keeps typed slash closed after regular text", () => {
    const editor = createEditor();
    editor.commands.setContent("<p>regular text</p>");
    editor.commands.focus("end");

    editor.commands.insertContent("/");

    expect(slashCommandPluginKey.getState(editor.state)?.active).toBe(false);
  });
});
