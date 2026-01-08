import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/types";
import { createMCPServerDialogFormSchema } from "@app/components/actions/mcp/types";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";

export function getCreateMCPServerDialogDefaultValues(
  defaultServerConfig?: DefaultRemoteMCPServerConfig
): CreateMCPServerDialogFormValues {
  // RHF initializes field values from defaultValues not from the zod resolver. Zod defaults apply when the schema
  // is parsed
  const values = createMCPServerDialogFormSchema.parse({});

  if (defaultServerConfig?.url) {
    values.remoteServerUrl = defaultServerConfig.url;
  }
  if (defaultServerConfig) {
    values.authMethod = defaultServerConfig.authMethod ?? values.authMethod;
  }

  return values;
}
