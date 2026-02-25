import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/forms/types";
import { getTokenFieldLabel } from "@app/lib/actions/mcp_internal_actions/server_token_labels";
import {
  Icon,
  InformationCircleIcon,
  Input,
  Label,
  Tooltip,
} from "@dust-tt/sparkle";
import { useFormContext } from "react-hook-form";

interface InternalBearerTokenSectionProps {
  serverName?: string;
}

export function InternalBearerTokenSection({
  serverName,
}: InternalBearerTokenSectionProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<CreateMCPServerDialogFormValues>();

  const { label, placeholder, tooltip } = getTokenFieldLabel(serverName);

  return (
    <div className="space-y-2">
      <div className="flex items-center space-x-2">
        <Label htmlFor="bearerToken">{label}</Label>
        <Tooltip
          trigger={
            <Icon
              visual={InformationCircleIcon}
              size="xs"
              className="text-gray-400"
            />
          }
          label={tooltip}
        />
      </div>
      <Input
        id="bearerToken"
        placeholder={placeholder}
        {...register("sharedSecret")}
        isError={!!errors.sharedSecret}
        message={errors.sharedSecret?.message}
      />
    </div>
  );
}
