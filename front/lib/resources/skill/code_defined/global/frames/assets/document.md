# Editable documents in Frames

Use `Document` for narrative deliverables such as one-pagers, briefs, memos and written reports.
Keep the explanation in editable JSON text and use TSX for supporting charts and custom visuals.

## Create or edit

For an existing document, read its current TSX and JSON first so you include the user's latest
saved changes. Make focused edits and preserve the other text, visual names and layout.

For a new document, read `document.example.tsx` and `document.example.json` beside this guide.
Copy them into your Frame folder as `index.tsx` and `content.json`, then replace the illustrative
content with the user's material. Create a `manifest.json`, run the attached `lint.sh` and publish
as usual.

Import `Document` from `@dust/document/v1` and render `<Document path="./content.json" />`.
The component reads and saves that file itself. Its text needs no Frame function or database.
Use a relative path so the document stays with the Frame when it is copied or shared.

## Write the content

The file contains a Tiptap document, starting with `{"type":"doc","content":[...]}`. Write JSON
directly using regular file operations. The example shows headings, paragraphs, inline formatting,
a list and a visual block. For an empty document, use:

```json
{ "type": "doc", "content": [{ "type": "paragraph" }] }
```

- Text lives in `{"type":"text","text":"Your text"}` nodes inside paragraphs or headings.
- Headings use `attrs.level`. Prefer levels 1, 2 and 3 for the built-in typography.
- Use `bulletList` or `orderedList` containing `listItem` nodes, each containing a paragraph.
- `blockquote` contains paragraphs. `codeBlock` contains text and accepts `attrs.language`.
- `horizontalRule` and `hardBreak` have no content.
- Text marks include `bold`, `italic`, `strike`, `underline`, `code` and `link`.
  Links use `{"type":"link","attrs":{"href":"https://example.com"}}` in the text node's `marks`.

Convert Markdown into these nodes when using it as source material. The component reads JSON.
For tables or images, use a named visual block. Comments and collaborative editing are not
available yet.

## Add custom visuals

Place `{"type":"dustVisual","attrs":{"name":"revenue"}}` where the visual belongs in the JSON.
Pass the matching React content through `visuals={{ revenue: <RevenueChart /> }}` on `Document`.

The name connects the text file to your TSX. Build visuals with the usual Frame components,
React hooks, Recharts and Tailwind. Their buttons and charts remain interactive. Users edit the
surrounding text. Keep any durable state inside a visual in a Frame database, as with other
interactive applications.

## Layout and theme

Use `FrameRoot` for the page and its theme. Put layout and spacing on surrounding elements.
`Document` accepts `className` for its outer container. Keep its built-in editing controls.
For a shared visual direction, use the Frame's theme and semantic colors in your custom visuals.

## Saving and later edits

The editor autosaves after three seconds of inactivity. `autosaveDebounceMs` changes that delay.
`readOnly` disables editing. Shared public views and PDF exports are read-only automatically.

Republish after changing the Frame's files. The user can reopen the Frame to load the new version.

If the file changed while the user was editing, saving reports a conflict and keeps their draft.
Ask them to copy unsaved changes before reopening. Treat this as a single-editor document for now.
