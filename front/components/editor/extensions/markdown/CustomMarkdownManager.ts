import type {
  AnyExtension,
  JSONContent,
  MarkdownLexerConfiguration,
  MarkdownToken,
} from "@tiptap/core";
import MarkdownIt from "markdown-it";

interface MarkdownTokenizer {
  name: string;
  level?: "block" | "inline";
  start: (src: string) => number;
  tokenize: (
    src: string,
    tokens: MarkdownToken[],
    lexer: MarkdownLexerConfiguration
  ) => MarkdownToken | undefined;
}

interface MarkdownHandler {
  name: string;
  priority: number;
  parseMarkdown?: (
    token: MarkdownToken,
    helpers: ParseHelpers
  ) => JSONContent | JSONContent[] | null;
  renderMarkdown?: (node: JSONContent, helpers: RenderHelpers) => string | null;
  markdownTokenizer?: MarkdownTokenizer;
}

interface ParseHelpers {
  parseChildren: (tokens: MarkdownToken[]) => JSONContent[];
  renderChildren: (nodes: JSONContent[], separator?: string) => string;
}

interface RenderHelpers {
  renderChildren: (nodes: JSONContent[], separator?: string) => string;
}

/**
 * Custom Markdown Manager that uses markdown-it instead of marked.
 * Key difference: HTML tags are treated as literal text, not parsed as HTML.
 */
export class CustomMarkdownManager {
  private readonly md: MarkdownIt;
  private registry: Map<string, MarkdownHandler[]> = new Map();
  private nodeTypeRegistry: Map<string, MarkdownHandler[]> = new Map();
  private extensions: AnyExtension[] = [];
  private readonly indentStyle: "space" | "tab" = "space";
  private readonly indentSize: number = 2;

  constructor(options?: {
    indentation?: {
      style?: "space" | "tab";
      size?: number;
    };
    extensions: AnyExtension[];
  }) {
    // Initialize markdown-it with HTML disabled
    this.md = new MarkdownIt({
      html: false, // Critical: treat HTML as literal text
      breaks: true,
      linkify: false,
    });

    if (options?.indentation) {
      this.indentStyle = options.indentation.style ?? "space";
      this.indentSize = options.indentation.size ?? 2;
    }

    if (options?.extensions) {
      this.extensions = options.extensions;
      options.extensions.forEach((ext) => this.registerExtension(ext));
    }
  }

  get indentCharacter(): string {
    return this.indentStyle === "tab" ? "\t" : " ";
  }

  get indentString(): string {
    return this.indentCharacter.repeat(this.indentSize);
  }

  /**
   * Register a Tiptap extension for markdown parsing and rendering.
   * Reads `markdownTokenizer`, `parseMarkdown`, and `renderMarkdown` from the extension.
   */
  registerExtension(extension: AnyExtension): void {
    const config = extension.options ?? {};
    const name = extension.name;

    // Check if extension has markdown support
    const hasTokenizer = "markdownTokenizer" in extension.config;
    const hasParser = "parseMarkdown" in extension.config;
    const hasRenderer = "renderMarkdown" in extension.config;

    if (!hasTokenizer && !hasParser && !hasRenderer) {
      return;
    }

    const handler: MarkdownHandler = {
      name,
      priority: config.priority ?? 100,
    };

    if (hasTokenizer) {
      handler.markdownTokenizer = extension.config.markdownTokenizer as any;
    }

    if (hasParser) {
      handler.parseMarkdown = extension.config.parseMarkdown as any;
    }

    if (hasRenderer) {
      handler.renderMarkdown = extension.config.renderMarkdown as any;
    }

    // Register for token type (for parsing)
    if (hasTokenizer || hasParser) {
      const tokenName = handler.markdownTokenizer?.name ?? name;
      const handlers = this.registry.get(tokenName) ?? [];
      handlers.push(handler);
      handlers.sort((a, b) => (b.priority ?? 100) - (a.priority ?? 100));
      this.registry.set(tokenName, handlers);
    }

    // Register for node type (for rendering)
    if (hasRenderer) {
      const handlers = this.nodeTypeRegistry.get(name) ?? [];
      handlers.push(handler);
      handlers.sort((a, b) => (b.priority ?? 100) - (a.priority ?? 100));
      this.nodeTypeRegistry.set(name, handlers);
    }

    // Register custom tokenizer with markdown-it
    if (hasTokenizer && handler.markdownTokenizer) {
      this.registerCustomTokenizer(handler.markdownTokenizer);
    }
  }

  /**
   * Register a custom block or inline tokenizer with markdown-it.
   */
  private registerCustomTokenizer(tokenizer: MarkdownTokenizer): void {
    const { name, level, start, tokenize } = tokenizer;

    if (level === "block") {
      // Register as a block rule
      this.md.block.ruler.before(
        "paragraph",
        name,
        (state, startLine, endLine, silent) => {
          const pos = state.bMarks[startLine] + state.tShift[startLine];
          const max = state.eMarks[startLine];
          const src = state.src.slice(pos);

          // Check if this line matches our tokenizer
          const startIdx = start(src);
          if (startIdx !== 0) {
            return false;
          }

          if (silent) {
            return true;
          }

          // Let the custom tokenizer parse the content
          const fullSrc = state.src.slice(pos);
          const token = tokenize(fullSrc, [], {
            // Provide a simple lexer interface for custom tokenizers
            blockTokens: (src: string) => this.tokenizeBlock(src),
            inlineTokens: (src: string) => this.tokenizeInline(src),
          } as MarkdownLexerConfiguration);

          if (!token) {
            return false;
          }

          // Create a token in the markdown-it state
          const mdToken = state.push(name, "", 0);
          mdToken.content = token.text ?? "";
          mdToken.markup = token.raw ?? "";
          mdToken.map = [startLine, startLine + 1];

          // Store the custom token for later parsing
          (mdToken as any).customToken = token;

          // Calculate how many lines this token consumed
          const consumed = (token.raw ?? "").split("\n").length;
          state.line = startLine + consumed;

          return true;
        }
      );
    } else {
      // Inline tokenizers are more complex - simplified for now
      console.warn(`Inline custom tokenizers not yet fully supported: ${name}`);
    }
  }

  /**
   * Tokenize a block of markdown text (used by custom tokenizers).
   */
  private tokenizeBlock(src: string): MarkdownToken[] {
    const tokens = this.md.parse(src, {});
    return this.convertMarkdownItTokens(tokens);
  }

  /**
   * Tokenize inline markdown text (used by custom tokenizers).
   */
  private tokenizeInline(src: string): MarkdownToken[] {
    const env = {};
    const tokens: any[] = [];
    this.md.inline.parse(src, this.md, env, tokens);
    return this.convertMarkdownItTokens(tokens);
  }

  /**
   * Convert markdown-it tokens to Tiptap MarkdownToken format.
   */
  private convertMarkdownItTokens(tokens: any[]): MarkdownToken[] {
    return tokens.map((token) => ({
      type: token.type.replace(/_open$|_close$/, ""),
      raw: token.markup ?? "",
      text: token.content ?? "",
      tokens: token.children
        ? this.convertMarkdownItTokens(token.children)
        : [],
    }));
  }

  /**
   * Parse markdown string into Tiptap JSON document.
   */
  parse(markdown: string): JSONContent {
    const tokens = this.md.parse(markdown, {});
    const content = this.parseTokens(tokens);

    return {
      type: "doc",
      content,
    };
  }

  /**
   * Parse an array of markdown-it tokens into Tiptap JSON nodes.
   */
  private parseTokens(tokens: any[]): JSONContent[] {
    const result: JSONContent[] = [];
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      // Check if this is a custom token
      if ((token as any).customToken) {
        const customToken = (token as any).customToken;
        const parsed = this.parseCustomToken(customToken);
        if (parsed) {
          if (Array.isArray(parsed)) {
            result.push(...parsed);
          } else {
            result.push(parsed);
          }
        }
        i++;
        continue;
      }

      // Handle standard markdown-it tokens
      const parsed = this.parseStandardToken(token, tokens, i);
      if (parsed) {
        if (Array.isArray(parsed.nodes)) {
          result.push(...parsed.nodes);
        } else if (parsed.nodes) {
          result.push(parsed.nodes);
        }
        i += parsed.consumed ?? 1;
      } else {
        i++;
      }
    }

    return result;
  }

  /**
   * Parse a custom token using registered handlers.
   */
  private parseCustomToken(
    token: MarkdownToken
  ): JSONContent | JSONContent[] | null {
    const handlers = this.registry.get(token.type);
    if (!handlers) {
      return null;
    }

    const helpers: ParseHelpers = {
      parseChildren: (tokens: MarkdownToken[]) => {
        // Convert MarkdownTokens to markdown-it format and parse
        const mdTokens = tokens.map((t) => ({
          type: t.type,
          content: t.text ?? "",
          markup: t.raw ?? "",
          children: t.tokens,
        }));
        return this.parseTokens(mdTokens);
      },
      renderChildren: (nodes: JSONContent[], separator?: string) => {
        return this.renderNodes(nodes, undefined, separator);
      },
    };

    for (const handler of handlers) {
      if (handler.parseMarkdown) {
        const result = handler.parseMarkdown(token, helpers);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Parse a standard markdown-it token.
   */
  private parseStandardToken(
    token: any,
    tokens: any[],
    index: number
  ): { nodes: JSONContent | JSONContent[] | null; consumed: number } | null {
    // Handle common block types
    switch (token.type) {
      case "paragraph_open": {
        const contentToken = tokens[index + 1];
        const content = contentToken
          ? this.parseInlineContent(contentToken.children ?? [])
          : [];
        return {
          nodes: { type: "paragraph", content },
          consumed: 3, // paragraph_open, inline, paragraph_close
        };
      }

      case "heading_open": {
        const level = parseInt((token.tag ?? "h1").replace("h", ""), 10);
        const contentToken = tokens[index + 1];
        const content = contentToken
          ? this.parseInlineContent(contentToken.children ?? [])
          : [];
        return {
          nodes: { type: "heading", attrs: { level }, content },
          consumed: 3,
        };
      }

      case "bullet_list_open": {
        const listItems: JSONContent[] = [];
        let i = index + 1;
        while (i < tokens.length && tokens[i].type !== "bullet_list_close") {
          if (tokens[i].type === "list_item_open") {
            const itemResult = this.parseListItem(tokens, i);
            if (itemResult) {
              listItems.push(itemResult.node);
              i = itemResult.nextIndex;
            } else {
              i++;
            }
          } else {
            i++;
          }
        }
        return {
          nodes: { type: "bulletList", content: listItems },
          consumed: i - index + 1,
        };
      }

      case "ordered_list_open": {
        const listItems: JSONContent[] = [];
        const start = token.attrGet ? token.attrGet("start") : undefined;
        let i = index + 1;
        while (i < tokens.length && tokens[i]?.type !== "ordered_list_close") {
          if (tokens[i]?.type === "list_item_open") {
            const itemResult = this.parseListItem(tokens, i);
            if (itemResult) {
              listItems.push(itemResult.node);
              i = itemResult.nextIndex;
            } else {
              i++;
            }
          } else {
            i++;
          }
        }
        return {
          nodes: {
            type: "orderedList",
            attrs: start ? { start: parseInt(start, 10) } : undefined,
            content: listItems,
          },
          consumed: i - index + 1,
        };
      }

      case "code_block":
      case "fence": {
        const language = token.info ?? null;
        return {
          nodes: {
            type: "codeBlock",
            attrs: language ? { language } : undefined,
            content: token.content
              ? [{ type: "text", text: token.content }]
              : [],
          },
          consumed: 1,
        };
      }

      case "blockquote_open": {
        const blockquoteContent: JSONContent[] = [];
        let i = index + 1;
        while (i < tokens.length && tokens[i]?.type !== "blockquote_close") {
          const result = this.parseStandardToken(tokens[i], tokens, i);
          if (result?.nodes) {
            if (Array.isArray(result.nodes)) {
              blockquoteContent.push(...result.nodes);
            } else {
              blockquoteContent.push(result.nodes);
            }
            i += result.consumed;
          } else {
            i++;
          }
        }
        return {
          nodes: { type: "blockquote", content: blockquoteContent },
          consumed: i - index + 1,
        };
      }

      case "hr":
        return {
          nodes: { type: "horizontalRule" },
          consumed: 1,
        };

      default:
        return null;
    }
  }

  /**
   * Parse a list item from markdown-it tokens.
   */
  private parseListItem(
    tokens: any[],
    startIndex: number
  ): { node: JSONContent; nextIndex: number } | null {
    const itemContent: JSONContent[] = [];
    let i = startIndex + 1;

    while (i < tokens.length && tokens[i].type !== "list_item_close") {
      const result = this.parseStandardToken(tokens[i], tokens, i);
      if (result?.nodes) {
        if (Array.isArray(result.nodes)) {
          itemContent.push(...result.nodes);
        } else {
          itemContent.push(result.nodes);
        }
        i += result.consumed;
      } else {
        i++;
      }
    }

    return {
      node: { type: "listItem", content: itemContent },
      nextIndex: i + 1,
    };
  }

  /**
   * Parse inline content (text, bold, italic, links, etc.).
   */
  private parseInlineContent(tokens: any[]): JSONContent[] {
    const result: JSONContent[] = [];

    for (const token of tokens) {
      switch (token.type) {
        case "text":
          result.push({ type: "text", text: token.content });
          break;

        case "code_inline":
          result.push({
            type: "text",
            text: token.content,
            marks: [{ type: "code" }],
          });
          break;

        case "strong_open":
        case "em_open":
        case "link_open":
          // These are handled by the markdown-it state machine
          // For now, simplified inline parsing
          break;

        case "softbreak":
        case "hardbreak":
          result.push({ type: "hardBreak" });
          break;

        default:
          if (token.content) {
            result.push({ type: "text", text: token.content });
          }
      }
    }

    return result;
  }

  /**
   * Serialize a Tiptap JSON document to markdown string.
   */
  serialize(docOrContent: JSONContent): string {
    if (docOrContent.type === "doc") {
      return this.renderNodes(docOrContent.content ?? [], undefined);
    }
    return this.renderNodeToMarkdown(docOrContent);
  }

  /**
   * Render a single node to markdown.
   */
  renderNodeToMarkdown(
    node: JSONContent,
    parentNode?: JSONContent,
    index?: number,
    level: number = 0
  ): string {
    // Try custom renderers first
    const handlers = this.nodeTypeRegistry.get(node.type);
    if (handlers) {
      const helpers: RenderHelpers = {
        renderChildren: (nodes: JSONContent[], separator?: string) =>
          this.renderNodes(nodes, node, separator),
      };

      for (const handler of handlers) {
        if (handler.renderMarkdown) {
          const result = handler.renderMarkdown(node, helpers);
          if (result !== null && result !== undefined) {
            return result;
          }
        }
      }
    }

    // Fallback to default rendering
    return this.renderNodeDefault(node, parentNode, index, level);
  }

  /**
   * Default node rendering (fallback).
   */
  private renderNodeDefault(
    node: JSONContent,
    parentNode?: JSONContent,
    index?: number,
    level: number = 0
  ): string {
    const children = node.content ?? [];

    switch (node.type) {
      case "doc":
        return this.renderNodes(children, node);

      case "paragraph":
        return this.renderNodes(children, node);

      case "heading": {
        const level = node.attrs?.level ?? 1;
        const content = this.renderNodes(children, node);
        return `${"#".repeat(level)} ${content}`;
      }

      case "bulletList":
        return this.renderNodes(children, node, "\n");

      case "orderedList": {
        const start = node.attrs?.start ?? 1;
        return children
          .map((child, i) => {
            const num = start + i;
            const content = this.renderNodeToMarkdown(child, node, i, level);
            return `${num}. ${content}`;
          })
          .join("\n");
      }

      case "listItem": {
        const content = this.renderNodes(children, node, "\n");
        if (parentNode?.type === "orderedList") {
          return content;
        }
        return `- ${content}`;
      }

      case "codeBlock": {
        const language = node.attrs?.language ?? "";
        const code = children.map((c) => c.text ?? "").join("");
        return `\`\`\`${language}\n${code}\n\`\`\``;
      }

      case "blockquote": {
        const content = this.renderNodes(children, node, "\n");
        return content
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
      }

      case "horizontalRule":
        return "---";

      case "hardBreak":
        return "<br>";

      case "text":
        return node.text ?? "";

      default:
        return "";
    }
  }

  /**
   * Render an array of nodes with proper separators.
   */
  renderNodes(
    nodeOrNodes: JSONContent | JSONContent[],
    parentNode?: JSONContent,
    separator?: string,
    index?: number,
    level: number = 0
  ): string {
    const nodes = Array.isArray(nodeOrNodes) ? nodeOrNodes : [nodeOrNodes];

    // Default separator based on parent type
    const sep = separator ?? (parentNode?.type === "doc" ? "\n\n" : "");

    return nodes
      .map((node, i) => this.renderNodeToMarkdown(node, parentNode, i, level))
      .join(sep);
  }
}
