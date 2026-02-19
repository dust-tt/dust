import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/forms/types";
import {
  Icon,
  InformationCircleIcon,
  Input,
  Label,
  Tooltip,
} from "@dust-tt/sparkle";
import { useFormContext } from "react-hook-form";

export function InternalBearerTokenSection() {
  const {
    register,
    formState: { errors },
  } = useFormContext<CreateMCPServerDialogFormValues>();

  return (
    <div className="space-y-2">
      <div className="flex items-center space-x-2">
        <Label htmlFor="bearerToken">Bearer Token (Authorization)</Label>
        <Tooltip
          trigger={
            <Icon
              visual={InformationCircleIcon}
              size="xs"
              className="text-gray-400"
            />
          }
          label="This will be sent alongside the request as a Bearer token in the Authorization header."
        />
      </div>
      <Input
        id="bearerToken"
        placeholder="Paste the Bearer Token here"
        {...register("sharedSecret")}
        isError={!!errors.sharedSecret}
        message={errors.sharedSecret?.message}
      />
    </div>
  );
}
