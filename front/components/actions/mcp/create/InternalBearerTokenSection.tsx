import {
  Icon,
  InformationCircleIcon,
  Input,
  Label,
  Tooltip,
} from "@dust-tt/sparkle";
import { useController, useFormContext } from "react-hook-form";

import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/types";

export function InternalBearerTokenSection() {
  const form = useFormContext<CreateMCPServerDialogFormValues>();
  const { field: sharedSecretField } = useController({
    control: form.control,
    name: "sharedSecret",
  });
  const sharedSecret = sharedSecretField.value;

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
        {...sharedSecretField}
        value={sharedSecret ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          sharedSecretField.onChange(value === "" ? undefined : value);
        }}
        isError={!sharedSecret}
        message={!sharedSecret ? "Bearer token is required" : undefined}
      />
    </div>
  );
}
