import { INTERACTIVE_CONTENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { z } from "zod";

// The legacy create tool comes first in the legacy metadata: destructuring `mode` below fails to
// type-check if it ever moves.
const [LEGACY_CREATE_TOOL_METADATA] = INTERACTIVE_CONTENT_TOOLS_METADATA;
const {
  mode: _mode,
  source: _source,
  ...LEGACY_CREATE_SCHEMA_WITHOUT_MODE
} = LEGACY_CREATE_TOOL_METADATA.schema;

// Frames v2 tools served on top of the allowlisted legacy tools. The server keeps the legacy
// server metadata: Frames v2 changes which tools it exposes, not the server itself.
export const INTERACTIVE_CONTENT_V2_TOOLS_METADATA = [
  {
    ...LEGACY_CREATE_TOOL_METADATA,
    description:
      "Create a new Frame from an existing template, copied server-side without reading or " +
      "regenerating its source. Use it only to instantiate a template: write any other new " +
      "Frame with the Computer and publish it with `dsbx frame publish`. The Frame is created as " +
      "a legacy Frame at `conversation-<conversationId>/<file_name>`: change it by editing that " +
      "source file in place, then publish it with " +
      "`dsbx frame publish /files/conversation-<conversationId>/<file_name>`. Never use this tool " +
      "to replace a Frame that already exists.",
    schema: {
      ...LEGACY_CREATE_SCHEMA_WITHOUT_MODE,
      source: z
        .string()
        .describe(
          "A reference to the template: a knowledge base node ID or a scoped file system path " +
            "(e.g. `pod-<id>/templates/my_template.tsx` or `conversation-<id>/my_template.tsx`). " +
            "Content is fetched server-side without consuming tokens."
        ),
    },
  },
] as const;
