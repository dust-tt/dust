import type { MCPServerOAuthFormValues } from "@app/components/actions/mcp/types";
import { mcpServerOAuthFormSchema } from "@app/components/actions/mcp/types";

export function getConnectMCPServerDialogDefaultValues(): MCPServerOAuthFormValues {
  return mcpServerOAuthFormSchema.parse({});
}
