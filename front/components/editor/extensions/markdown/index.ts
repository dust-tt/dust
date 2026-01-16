import { Markdown } from "@tiptap/markdown";

import { CustomMarkdown } from "./CustomMarkdownExtension";

/**
 * Get the appropriate Markdown extension based on feature flag.
 *
 * @param useCustom - Whether to use custom markdown implementation.
 *                    Should be set based on the workspace feature flag:
 *                    ```typescript
 *                    const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
 *                    const extension = getMarkdownExtension(hasFeature("custom_markdown_implementation"));
 *                    ```
 * @returns The Markdown extension to use (either @tiptap/markdown or CustomMarkdown)
 */
export function getMarkdownExtension(useCustom: boolean) {
  if (useCustom) {
    return CustomMarkdown;
  }
  return Markdown;
}

// Re-export for convenience
export { CustomMarkdown } from "./CustomMarkdownExtension";
export { CustomMarkdownManager } from "./CustomMarkdownManager";
