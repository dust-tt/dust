import {
  Button,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  TextArea,
} from "@dust-tt/sparkle";
import type { useForm } from "react-hook-form";
import { Controller } from "react-hook-form";
import { z } from "zod";

import {
  PostWebhookSourcesSchema,
  WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS,
} from "@app/types/triggers/webhooks";

export const validateCustomHeadersFromString = (value: string | null) => {
  if (value === null || value.trim() === "") {
    return { parsed: null };
  }
  try {
    const parsed = JSON.parse(value);
    const result = z.record(z.string()).nullable().safeParse(parsed);

    return result.success ? { parsed: result.data } : null;
  } catch {
    return null;
  }
};

export const CreateWebhookSourceSchema = PostWebhookSourcesSchema.extend({
  customHeaders: z
    .string()
    .nullable()
    .refine(validateCustomHeadersFromString, "Invalid JSON format"),
});

export type CreateWebhookSourceFormData = z.infer<
  typeof CreateWebhookSourceSchema
>;

type CreateWebhookSourceFormContentProps = {
  form: ReturnType<typeof useForm<CreateWebhookSourceFormData>>;
};

export function CreateWebhookSourceFormContent({
  form,
}: CreateWebhookSourceFormContentProps) {
  return (
    <>
      <Controller
        control={form.control}
        name="name"
        render={({ field }) => (
          <Input
            {...field}
            label="Name"
            placeholder="Name..."
            isError={form.formState.errors.name !== undefined}
            message={form.formState.errors.name?.message}
            messageStatus="error"
            autoFocus
          />
        )}
      />

      <Controller
        control={form.control}
        name="secret"
        render={({ field }) => (
          <Input
            {...field}
            label="Secret"
            type="password"
            placeholder="Secret for validation..."
            isError={form.formState.errors.secret !== undefined}
            message={form.formState.errors.secret?.message}
            messageStatus="error"
          />
        )}
      />

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
        <Label>Signature Algorithm</Label>
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

      <Controller
        control={form.control}
        name="customHeaders"
        render={({ field }) => (
          <>
            <Label htmlFor="customHeaders">Custom Headers (optional)</Label>
            <TextArea
              {...field}
              value={field.value ?? undefined}
              id="customHeaders"
              placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
              error={form.formState.errors.customHeaders?.message}
              showErrorLabel={true}
              rows={4}
            />
          </>
        )}
      />
    </>
  );
}
