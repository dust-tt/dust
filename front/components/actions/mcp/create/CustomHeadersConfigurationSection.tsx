import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/forms/types";
import { McpServerHeaders } from "@app/components/actions/mcp/MCPServerHeaders";
import { requiresBearerTokenConfiguration } from "@app/lib/actions/mcp_helper";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { MCPServerType } from "@app/lib/api/mcp";
import {
  Icon,
  InformationCircleIcon,
  Label,
  SliderToggle,
  Tooltip,
} from "@dust-tt/sparkle";
import { useController, useFieldArray, useFormContext } from "react-hook-form";

interface CustomHeadersConfigurationSectionProps {
  defaultServerConfig?: DefaultRemoteMCPServerConfig;
  internalMCPServer?: MCPServerType;
}

export function CustomHeadersConfigurationSection({
  defaultServerConfig,
  internalMCPServer,
}: CustomHeadersConfigurationSectionProps) {
  const form = useFormContext<CreateMCPServerDialogFormValues>();
  const { field: useCustomHeadersField } = useController({
    control: form.control,
    name: "useCustomHeaders",
  });
  const { fields: customHeaders, replace: replaceCustomHeaders } =
    useFieldArray({
      control: form.control,
      name: "customHeaders",
    });

  const useCustomHeaders = useCustomHeadersField.value;

  const showToggle =
    !defaultServerConfig &&
    (!internalMCPServer || requiresBearerTokenConfiguration(internalMCPServer));

  return (
    <>
      {showToggle && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Label htmlFor="customHeaders">Use custom headers</Label>
              <Tooltip
                trigger={
                  <Icon
                    visual={InformationCircleIcon}
                    size="xs"
                    className="text-gray-400"
                  />
                }
                label="Custom headers can be added for advanced networking such as firewalls."
              />
            </div>
            <SliderToggle
              disabled={false}
              selected={useCustomHeaders}
              onClick={() => useCustomHeadersField.onChange(!useCustomHeaders)}
            />
          </div>
        </div>
      )}

      {useCustomHeaders && (
        <McpServerHeaders
          headers={customHeaders}
          onHeadersChange={replaceCustomHeaders}
        />
      )}
    </>
  );
}
