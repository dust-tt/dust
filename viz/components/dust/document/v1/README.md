# Document in Frames

`@dust/document/v1` renders Markdown or saved document JSON with Dust's typography,
selection formatting, and slash commands. Any Frame can use it alongside other JSX.

```tsx
import { Document } from "@dust/document/v1";

export default function Brief() {
  return (
    <Document
      initialContent={"# Project brief\n\nThe proposed approach…"}
      className="mx-auto max-w-3xl rounded-xl border"
    />
  );
}
```

| Prop | Behavior |
| --- | --- |
| `initialContent: string` | Initial Markdown or serialized document JSON. Load it before mounting. |
| `contentType?: "markdown" \| "json"` | Defaults to Markdown. Use JSON when reopening saved editor content. |
| `className?: string` | Styles the outer container's layout and surface. The inner reading typography stays consistent. |
| `readOnly?: boolean` | Requests read-only rendering. Shared views and PDF rendering always enforce read-only mode. |
| `onSave?: (contentJson: string) => Promise<DocumentSaveResult>` | Enables editing in an editable host and persists the serialized document. |

Without a save callback, the document is read-only. The Frame host must also enable
editing; generated props cannot enable editing in a shared or PDF view.

A save callback returns `{ ok: true }` only after persistence succeeds, or
`{ ok: false, error: string }` on failure. Saves run after three seconds without
edits, or immediately with Cmd/Ctrl+S. Only one request runs at a time. Edits during
a request remain dirty; failed saves preserve the draft and pause automatic retries
until Retry or Cmd/Ctrl+S. This module does not supply storage or authorization.

`initialContent` is captured on mount. Remount with a new key to open another
document; changing props does not replace an open draft. Invalid stored JSON shows
an error and disables editing. Closing before “Saved” can discard pending edits:
navigation protection and coordination with external updates belong to the host
integration. Shared views and exports render the content supplied to this Frame;
this component does not publish a snapshot of a live database automatically.
