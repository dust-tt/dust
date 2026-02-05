import rehypeKatex from "rehype-katex";
import type { Transformer } from "unified";

/**
 * A safe wrapper around rehypeKatex that catches errors and silently continues processing.
 *
 * Issue: The upstream rehype-katex@7.0.1 plugin crashes with "Cannot read properties of undefined
 * (reading 'className')" when processing certain HTML structures like footnote references ([^4])
 * that generate <sup> elements within <a> tags.
 * The plugin attempts to access the className property on undefined objects during its DOM
 * traversal.
 *
 * This wrapper catches those errors and allows markdown processing to continue without crashing
 * the component.
 */
type RehypeKatexOptions = Parameters<typeof rehypeKatex>[0];

export const safeRehypeKatex: (options?: RehypeKatexOptions) => Transformer = (
  options: RehypeKatexOptions = {}
): Transformer => {
  return (tree, file) => {
    try {
      const katexProcessor = rehypeKatex(options);
      // Note: Type incompatibility exists between react-markdown@8.0.7 (uses vfile@5.3.7) and
      // rehype-katex@7.0.1 (uses vfile@6.0.3). Consider upgrading to react-markdown@10+ for proper
      // type compatibility.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return katexProcessor(tree as any, file as any);
    } catch (error) {
      // Log the error for debugging but don't throw.
      console.warn("rehypeKatex processing error:", error);
      // Return the tree unchanged
      return tree;
    }
  };
};
