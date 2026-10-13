import type { MarkdownManager } from "@tiptap/markdown";
import type { MarkedExtension, MarkedOptions } from "marked";
import { Marked } from "marked";

type TipTapMarked = NonNullable<
  NonNullable<ConstructorParameters<typeof MarkdownManager>[0]>["marked"]
>;

// TipTap types the instance as marked's global function, and it and `content.ts` call only these
// members of it.
const isTipTapMarked = (value: unknown): value is TipTapMarked =>
  typeof value === "function" &&
  "defaults" in value &&
  "Lexer" in value &&
  "lexer" in value &&
  "use" in value &&
  "setOptions" in value;

/**
 * @cc [owner:tdraier,label:performance;architecture] document-markdown-own-marked
 * Every TipTap Markdown parser of documents, a `MarkdownManager` or an editor's `Markdown`
 * extension, MUST parse with an instance returned by its own call to `createDocumentMarked`,
 * never with marked's global instance or another parser's: TipTap adds a parser's tokenizers to
 * its instance and never removes them, and other editors add theirs to the global one.
 */
export const createDocumentMarked = (): TipTapMarked => {
  const instance = new Marked();
  const parse = (src: string, options?: MarkedOptions | null) =>
    instance.parse(src, options);
  const adapter: unknown = Object.defineProperties(parse, {
    defaults: { get: () => instance.defaults },
    Lexer: { value: instance.Lexer },
    lexer: {
      value: (src: string, options?: MarkedOptions) =>
        instance.lexer(src, options),
    },
    use: {
      value: (...extensions: MarkedExtension[]) => {
        instance.use(...extensions);
        return adapter;
      },
    },
    setOptions: {
      value: (options: MarkedOptions) => {
        instance.setOptions(options);
        return adapter;
      },
    },
  });
  if (!isTipTapMarked(adapter)) {
    throw new Error("The document Markdown instance is incomplete.");
  }
  return adapter;
};
