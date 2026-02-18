import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { PostCredentialsResponseBody } from "@app/pages/api/w/[wId]/credentials";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { Input, TextArea } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const snowflakeKeypairFormSchema = z.object({
  account: z.string().min(1, "Account is required."),
  username: z.string().min(1, "Username is required."),
  role: z.string().min(1, "Role is required."),
  warehouse: z.string().min(1, "Warehouse is required."),
  privateKey: z.string().min(1, "Private key is required."),
  privateKeyPassphrase: z.string().optional(),
});

type SnowflakeKeypairFormValues = z.infer<typeof snowflakeKeypairFormSchema>;

export interface StaticCredentialFormHandle {
  submit: () => Promise<void>;
}

interface SnowflakeKeypairCredentialFormProps {
  owner: LightWorkspaceType;
  onValidityChange: (isValid: boolean) => void;
  onCredentialCreated: (credentialId: string) => void;
}

export const SnowflakeKeypairCredentialForm = forwardRef<
  StaticCredentialFormHandle,
  SnowflakeKeypairCredentialFormProps
>(function SnowflakeKeypairCredentialForm(
  { owner, onValidityChange, onCredentialCreated },
  ref
) {
  const sendNotification = useSendNotification();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastReportedValidity = useRef<boolean | null>(null);

  const form = useForm<SnowflakeKeypairFormValues>({
    resolver: zodResolver(snowflakeKeypairFormSchema),
    defaultValues: {
      account: "",
      username: "",
      role: "",
      warehouse: "",
      privateKey: "",
      privateKeyPassphrase: "",
    },
    mode: "onChange",
  });

  const isValid = form.formState.isValid && !isSubmitting;

  useEffect(() => {
    if (lastReportedValidity.current !== isValid) {
      lastReportedValidity.current = isValid;
      onValidityChange(isValid);
    }
  }, [isValid, onValidityChange]);

  const handleSave = async (values: SnowflakeKeypairFormValues) => {
    setIsSubmitting(true);

    try {
      const response = await clientFetch(`/api/w/${owner.sId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "snowflake",
          credentials: {
            auth_type: "keypair",
            username: values.username,
            account: values.account,
            role: values.role,
            warehouse: values.warehouse,
            private_key: values.privateKey,
            private_key_passphrase: values.privateKeyPassphrase,
          },
        }),
      });

      const result: WithAPIErrorResponse<PostCredentialsResponseBody> =
        await response.json();

      if (!response.ok || isAPIErrorResponse(result)) {
        sendNotification({
          type: "error",
          title: "Failed to save Snowflake credentials",
          description: isAPIErrorResponse(result)
            ? result.error.message
            : "An error occurred.",
        });
        return;
      }

      onCredentialCreated(result.credentials.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  useImperativeHandle(ref, () => ({
    submit: () => form.handleSubmit(handleSave)(),
  }));

  return (
    <div className="w-full space-y-5 text-foreground dark:text-foreground-night">
      <Input
        {...form.register("account")}
        label="Account"
        placeholder="abc123.us-east-1"
        isError={!!form.formState.errors.account}
        message={form.formState.errors.account?.message}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          {...form.register("username")}
          label="Username"
          isError={!!form.formState.errors.username}
          message={form.formState.errors.username?.message}
        />
        <Input
          {...form.register("role")}
          label="Role"
          isError={!!form.formState.errors.role}
          message={form.formState.errors.role?.message}
        />
      </div>
      <Input
        {...form.register("warehouse")}
        label="Warehouse"
        isError={!!form.formState.errors.warehouse}
        message={form.formState.errors.warehouse?.message}
      />
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Private key (PEM format)
        </label>
        <TextArea
          {...form.register("privateKey")}
          placeholder="-----BEGIN PRIVATE KEY-----"
          rows={8}
        />
        {form.formState.errors.privateKey?.message && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {form.formState.errors.privateKey.message}
          </p>
        )}
      </div>
      <Input
        {...form.register("privateKeyPassphrase")}
        label="Private key passphrase (optional)"
        type="password"
      />
    </div>
  );
});
