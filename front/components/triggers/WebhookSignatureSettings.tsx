import {
  Button,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@dust-tt/sparkle";
import { Controller, useFormContext } from "react-hook-form";

import type { WebhookSourceFormValues } from "@app/components/triggers/forms/webhookSourceFormSchema";
import { WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS } from "@app/types/triggers/webhooks";

export function WebhookSignatureSettings() {
  const form = useFormContext<WebhookSourceFormValues>();

  return (
    <div className="flex flex-col space-y-2">
      <Controller
        control={form.control}
        name="signatureHeader"
        render={({ field }) => (
          <Input
            {...field}
            label="Signature Header"
            placeholder="Signature header..."
            isError={form.formState.errors.signatureHeader !== undefined}
            message={form.formState.errors.signatureHeader?.message}
            messageStatus="error"
          />
        )}
      />

      <div className="flex items-center justify-between space-y-2">
        <Label htmlFor="trigger-signature-algorithm">Signature Algorithm</Label>
        <Controller
          control={form.control}
          name="signatureAlgorithm"
          render={({ field }) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  label={field.value}
                  variant="outline"
                  className="!mt-0"
                  icon={ChevronDownIcon}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS.map((algorithm) => (
                  <DropdownMenuItem
                    key={algorithm}
                    onClick={() => field.onChange(algorithm)}
                  >
                    {algorithm}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      </div>
    </div>
  );
}
