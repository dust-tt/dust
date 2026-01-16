import type { Content } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import type { Fragment, Node } from "@tiptap/pm/model";

import { CustomMarkdownManager } from "./CustomMarkdownManager";

type ContentType = "json" | "html" | "markdown";

// Extend Tiptap's module declarations to add markdown support
declare module "@tiptap/core" {
  interface Editor {
    /**
     * Get the content of the editor as markdown.
     */
    getMarkdown: () => string;
    /**
     * The custom markdown manager instance.
     */
    customMarkdown?: CustomMarkdownManager;
  }

  interface EditorOptions {
    /**
     * The content type the content is provided as.
     *
     * @default 'json'
     */
    contentType?: ContentType;
  }

  interface Storage {
    customMarkdown?: CustomMarkdownExtensionStorage;
  }

  interface InsertContentOptions {
    /**
     * The content type the content is provided as.
     *
     * @default 'json'
     */
    contentType?: ContentType;
  }

  interface InsertContentAtOptions {
    /**
     * The content type the content is provided as.
     *
     * @default 'json'
     */
    contentType?: ContentType;
  }

  interface SetContentOptions {
    /**
     * The content type the content is provided as.
     *
     * @default 'json'
     */
    contentType?: ContentType;
  }
}

export type CustomMarkdownExtensionOptions = {
  /**
   * Configure the indentation style and size for lists and code blocks.
   */
  indentation?: {
    style?: "space" | "tab";
    size?: number;
  };
};

export type CustomMarkdownExtensionStorage = {
  manager: CustomMarkdownManager;
};

/**
 * Custom Markdown extension that uses markdown-it instead of marked.
 * Key feature: HTML tags are treated as literal text, not parsed as HTML.
 *
 * This is a drop-in replacement for @tiptap/markdown that can be used
 * in parallel for testing.
 */
export const CustomMarkdown = Extension.create<
  CustomMarkdownExtensionOptions,
  CustomMarkdownExtensionStorage
>({
  name: "customMarkdown",

  addOptions() {
    return {
      indentation: {
        style: "space",
        size: 2,
      },
    };
  },

  addStorage() {
    return {
      manager: new CustomMarkdownManager({
        indentation: this.options.indentation,
        extensions: [],
      }),
    };
  },

  onBeforeCreate() {
    // Initialize the manager with all extensions
    this.storage.manager = new CustomMarkdownManager({
      indentation: this.options.indentation,
      extensions: this.editor.extensionManager.extensions,
    });

    // Add the manager to the editor for easy access
    this.editor.customMarkdown = this.storage.manager;
  },

  onCreate() {
    // Add getMarkdown method to the editor
    this.editor.getMarkdown = () => {
      const json = this.editor.getJSON();
      return this.storage.manager.serialize(json);
    };

    // Override the contentType handling to support markdown
    const originalSetContent = this.editor.commands.setContent.bind(
      this.editor.commands
    );
    const originalInsertContent = this.editor.commands.insertContent.bind(
      this.editor.commands
    );
    const originalInsertContentAt = this.editor.commands.insertContentAt.bind(
      this.editor.commands
    );

    // Override setContent to handle markdown
    this.editor.commands.setContent = (content: any, options?: any) => {
      const contentType =
        options?.contentType || this.editor.options.contentType;

      if (contentType === "markdown" && typeof content === "string") {
        const json = this.storage.manager.parse(content);
        return originalSetContent(json, {
          ...options,
          contentType: "json",
        });
      }

      return originalSetContent(content, options);
    };

    // Override insertContent to handle markdown
    this.editor.commands.insertContent = (content: any, options?: any) => {
      const contentType = options?.contentType;

      if (contentType === "markdown" && typeof content === "string") {
        const json = this.storage.manager.parse(content);
        return originalInsertContent(json, {
          ...options,
          contentType: "json",
        });
      }

      return originalInsertContent(content, options);
    };

    // Override insertContentAt to handle markdown
    this.editor.commands.insertContentAt = (
      range: any,
      content: any,
      options?: any
    ) => {
      const contentType = options?.contentType;

      if (contentType === "markdown" && typeof content === "string") {
        const json = this.storage.manager.parse(content);
        return originalInsertContentAt(range, json, {
          ...options,
          contentType: "json",
        });
      }

      return originalInsertContentAt(range, content, options);
    };
  },
});

/**
 * Helper function to determine content type.
 */
export function assumeContentType(
  content: (Content | Fragment | Node) | string,
  contentType: ContentType
): ContentType {
  if (contentType) {
    return contentType;
  }

  if (typeof content === "string") {
    // Try to detect if it's JSON or markdown
    try {
      JSON.parse(content);
      return "json";
    } catch {
      return "markdown";
    }
  }

  return "json";
}
