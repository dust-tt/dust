import { getActiveSlashSubMenuFrame } from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
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

  it("opens the top-level slash menu after regular text", () => {
    const editor = createEditor();
    editor.commands.setContent("<p>regular text</p>");
    editor.commands.focus("end");

    editor.commands.openSlashCommand();

    expect(editor.getText()).toBe("regular text /");
    expect(slashCommandPluginKey.getState(editor.state)?.active).toBe(true);
    expect(
      getActiveSlashSubMenuFrame(editor.storage.slashCommand)
    ).toBeNull();
  });

  it("opens the top-level slash menu in an empty document", () => {
    const editor = createEditor();
    editor.commands.focus("end");

    editor.commands.openSlashCommand();

    expect(editor.getText()).toBe("/");
    expect(slashCommandPluginKey.getState(editor.state)?.active).toBe(true);
    expect(
      getActiveSlashSubMenuFrame(editor.storage.slashCommand)
    ).toBeNull();
  });

  it("keeps typed slash closed after regular text", () => {
    const editor = createEditor();
    editor.commands.setContent("<p>regular text</p>");
    editor.commands.focus("end");

    editor.commands.insertContent("/");

    expect(slashCommandPluginKey.getState(editor.state)?.active).toBe(false);
  });
});
