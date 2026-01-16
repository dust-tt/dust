# Custom Markdown Implementation

This directory contains a custom markdown implementation for Tiptap that addresses HTML parsing issues.

## Problem

The default `@tiptap/markdown` extension uses `marked` internally, which:
- Parses HTML tags as actual HTML elements
- Cannot easily disable HTML interpretation
- Causes issues when users write code examples with HTML tags

## Solution

This custom implementation uses `markdown-it` instead of `marked`, configured with `html: false`. This means:
- HTML tags like `<div>`, `<span>`, etc. are treated as literal text
- No need for HTML entity escaping (`&lt;` / `&gt;`)
- Users can write code examples naturally
- Only level-1 instruction blocks (like `<instructions>`) are recognized as special syntax

## Usage

### Switching Between Implementations

The custom markdown implementation is controlled by a workspace feature flag: `custom_markdown_implementation`

#### Method 1: Using Feature Flags (Recommended for Production)

In components with workspace context:

```typescript
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { getMarkdownExtension } from "@app/components/editor/extensions/markdown";

function MyEditor({ owner }) {
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const useCustomMarkdown = hasFeature("custom_markdown_implementation");

  const editor = useEditor({
    extensions: [
      // ... other extensions
      getMarkdownExtension(useCustomMarkdown),
    ],
  });
}
```

#### Method 2: Default Configuration (For Contexts Without Workspace)

For test utilities or contexts where workspace feature flags aren't available, edit `config.ts`:

```typescript
// Use default @tiptap/markdown (uses marked, parses HTML)
export const DEFAULT_USE_CUSTOM_MARKDOWN = false;

// Use custom implementation (uses markdown-it, HTML as text)
export const DEFAULT_USE_CUSTOM_MARKDOWN = true;
```

#### Method 3: Debug Mode

To compare both implementations side-by-side, edit `config.ts`:

```typescript
// This will log differences to console when markdown is generated
export const DEBUG_MARKDOWN_COMPARISON = true;
```

### Enabling the Feature Flag

To enable the custom markdown implementation for a workspace:

1. **Via Poke UI**: Go to `/poke/{workspaceId}` and enable `custom_markdown_implementation`
2. **Via API**: Add the feature flag to the workspace's whitelist
3. **For Development**: Set `DEFAULT_USE_CUSTOM_MARKDOWN = true` in `config.ts`

### In Your Code

The implementations are drop-in replacements:

```typescript
import { getMarkdownExtension } from "@app/components/editor/extensions/markdown";

// In your editor setup (without feature flag, uses default)
const editor = new Editor({
  extensions: [
    // ... other extensions
    getMarkdownExtension(),
  ],
});

// With feature flag
const editor = new Editor({
  extensions: [
    // ... other extensions
    getMarkdownExtension(useCustomMarkdown),
  ],
});

// Standard API works the same
const markdown = editor.getMarkdown();
editor.commands.setContent(markdown, { contentType: "markdown" });
```

## Architecture

### Files

- `CustomMarkdownManager.ts` - Core markdown parser/serializer using markdown-it
- `CustomMarkdownExtension.ts` - Tiptap extension wrapper
- `config.ts` - Feature flags for toggling implementations
- `index.ts` - Public API and helper functions

### How It Works

1. **CustomMarkdownManager**
   - Registers all Tiptap extensions (just like @tiptap/markdown)
   - Each extension can define `parseMarkdown`, `renderMarkdown`, and `markdownTokenizer`
   - Uses markdown-it for tokenization with HTML disabled
   - Calls extension-specific handlers for custom syntax (like instruction blocks)

2. **CustomMarkdownExtension**
   - Wraps CustomMarkdownManager as a Tiptap extension
   - Adds `editor.getMarkdown()` method
   - Intercepts `setContent`/`insertContent` to handle `contentType: 'markdown'`
   - Drop-in replacement for `@tiptap/markdown`

3. **Extension Integration**
   - Extensions define their markdown behavior using standard Tiptap patterns:
     ```typescript
     markdownTokenizer: {
       name: "instructionBlock",
       level: "block",
       start: (src) => src.match(/^</)?.index ?? -1,
       tokenize: (src, tokens, lexer) => { /* ... */ },
     },
     parseMarkdown: (token, helpers) => { /* ... */ },
     renderMarkdown: (node, helpers) => { /* ... */ },
     ```

## Testing

Run existing tests with either implementation:

```bash
# Test with default markdown
npm run test -- InstructionBlockExtension.test.ts

# Test with custom markdown
# First, set USE_CUSTOM_MARKDOWN = true in config.ts
npm run test -- InstructionBlockExtension.test.ts
```

Both implementations should pass the same tests.

## Limitations

### Current Implementation

The custom markdown parser currently supports:
- ✅ Paragraphs, headings, lists (bullet and ordered)
- ✅ Code blocks, blockquotes, horizontal rules
- ✅ Custom tokenizers (like instruction blocks)
- ✅ HTML treated as literal text
- ⚠️ Basic inline formatting (bold, italic, code - simplified)
- ❌ Task lists (not yet implemented)
- ❌ Tables (not yet implemented)
- ❌ Complex inline parsing (marks spanning nodes)

### Next Steps

If you decide to adopt the custom implementation:
1. Enhance inline parsing for marks (bold, italic, links)
2. Add task list support
3. Add table support if needed
4. Optimize custom tokenizer registration
5. Remove `@tiptap/markdown` dependency

## Benefits

Compared to trying to configure `marked` to disable HTML:

✅ **Cleaner**: HTML disabled by default, no complex hooks needed
✅ **Simpler**: Direct control over markdown parsing
✅ **Maintainable**: Less fighting with Tiptap's HTML interpretation
✅ **Flexible**: Easy to extend for custom syntax
✅ **Performant**: markdown-it is well-optimized

## Migration Path

To fully migrate:

1. **Test phase** (current):
   - Keep both implementations
   - Toggle via feature flag: `custom_markdown_implementation`
   - Run tests on both
   - Compare outputs in debug mode

2. **Validation phase**:
   - Enable feature flag for select workspaces (e.g., internal Dust workspace)
   - Test with real user content
   - Verify all custom extensions work
   - Check edge cases
   - Monitor for issues

3. **Rollout phase**:
   - Stage: `dust_only` → `rolling_out` → `on_demand`
   - Gradually enable for more workspaces
   - Collect feedback and fix issues

4. **Adoption phase**:
   - Set `DEFAULT_USE_CUSTOM_MARKDOWN = true` as default
   - Enable feature flag for all workspaces
   - Remove old implementation
   - Remove `@tiptap/markdown` dependency

5. **Cleanup phase**:
   - Remove feature flag (make custom markdown the only option)
   - Remove config flags
   - Remove compatibility shims
   - Document new architecture
