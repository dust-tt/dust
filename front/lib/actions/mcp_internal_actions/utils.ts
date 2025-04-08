import type { z } from "zod";

import type { TextContentSchema } from "@app/lib/actions/mcp_actions";

// TODO(mcp): define these types somewhere.
export function makeMCPToolTextError(text: string): {
  isError: true;
  content: z.infer<typeof TextContentSchema>[];
} {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}
