import type { StaticCredentialFormHandle } from "@app/components/actions/mcp/MCPServerAuthConnection";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import datadogLogger from "@app/logger/datadogLogger";
import type { PostCredentialsResponseBody } from "@app/types/api/oauth";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isAPIErrorResponse } from "@app/types/error";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { Input, TextArea } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

function getSnowflakeKeypairFormSchema(
  t: (descriptor: MessageDescriptor) => string
) {
  return z.object({
    account: z.string().min(1, t(msg`Account is required.`)),
    username: z.string().min(1, t(msg`Username is required.`)),
    role: z.string().min(1, t(msg`Role is required.`)),
    warehouse: z.string().min(1, t(msg`Warehouse is required.`)),
    privateKey: z.string().min(1, t(msg`Private key is required.`)),
    privateKeyPassphrase: z.string().optional(),
  });
}

type SnowflakeKeypairFormValues = z.infer<
  ReturnType<typeof getSnowflakeKeypairFormSchema>
>;

interface SnowflakeKeypairCredentialFormProps {
  owner: LightWorkspaceType;
  onValidityChange: (isValid: boolean) => void;
}

export const SnowflakeKeypairCredentialForm = forwardRef<
  StaticCredentialFormHandle,
  SnowflakeKeypairCredentialFormProps
>(function SnowflakeKeypairCredentialForm({ owner, onValidityChange }, ref) {
  const { t } = useLingui();
  const snowflakeKeypairFormSchema = useMemo(
    () => getSnowflakeKeypairFormSchema(t),
    [t]
  );
  const sendNotification = useSendNotification();
  const sendApiErrorNotification = useSendApiErrorNotification();
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

  const handleSave = async (
    values: SnowflakeKeypairFormValues
  ): Promise<string | null> => {
    setIsSubmitting(true);

    try {
      let response: Response;
      try {
        response = await clientFetch(`/api/w/${owner.sId}/credentials`, {
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
      } catch (err) {
        sendApiErrorNotification({
          title: t`Failed to save Snowflake credentials`,
          error: err,
        });
        datadogLogger.error(
          { workspaceId: owner.sId, err: normalizeError(err).message },
          "Snowflake keypair credential save failed: network error"
        );
        return null;
      }

      let result: WithAPIErrorResponse<PostCredentialsResponseBody>;
      try {
        result = await response.json();
      } catch (err) {
        const e = normalizeError(err);
        const status = response.status;
        sendNotification({
          type: "error",
          title: t`Failed to save Snowflake credentials`,
          description: t`Unexpected response from server (status ${status}).`,
        });
        datadogLogger.error(
          {
            workspaceId: owner.sId,
            statusCode: response.status,
            err: e.message,
          },
          "Snowflake keypair credential save failed: response parse error"
        );
        return null;
      }

      if (!response.ok || isAPIErrorResponse(result)) {
        sendApiErrorNotification({
          title: t`Failed to save Snowflake credentials`,
          error: result,
        });
        datadogLogger.error(
          {
            workspaceId: owner.sId,
            statusCode: response.status,
            errorType: isAPIErrorResponse(result)
              ? result.error.type
              : undefined,
            errorMessage: isAPIErrorResponse(result)
              ? result.error.message
              : undefined,
          },
          "Snowflake keypair credential save failed: server error"
        );
        return null;
      }

      return result.credentials.id;
    } finally {
      setIsSubmitting(false);
    }
  };

  useImperativeHandle(ref, () => ({
    submit: async () => {
      let credentialId: string | null = null;
      await form.handleSubmit(
        async (values) => {
          credentialId = await handleSave(values);
        },
        (errors) => {
          const description =
            Object.values(errors)
              .map((err) => err?.message)
              .filter((m): m is string => typeof m === "string" && m.length > 0)
              .join(" ") || t`One or more fields are invalid.`;
          sendNotification({
            type: "error",
            title: t`Please check the Snowflake credentials`,
            description,
          });
          datadogLogger.warn(
            {
              workspaceId: owner.sId,
              invalidFields: Object.keys(errors),
            },
            "Snowflake keypair credential form validation failed"
          );
        }
      )();
      return credentialId;
    },
  }));

  return (
    <div className="w-full space-y-5 text-foreground">
      <p className="text-sm text-muted-foreground">
        <Trans>
          Enter credentials for a Snowflake service user configured for key-pair
          authentication.
        </Trans>
      </p>

      <Input
        {...form.register("account")}
        label={t`Account`}
        placeholder="abc123.us-east-1"
        isError={!!form.formState.errors.account}
        message={form.formState.errors.account?.message}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          {...form.register("username")}
          label={t`Username`}
          isError={!!form.formState.errors.username}
          message={form.formState.errors.username?.message}
        />
        <Input
          {...form.register("role")}
          label={t`Role`}
          isError={!!form.formState.errors.role}
          message={form.formState.errors.role?.message}
        />
      </div>
      <Input
        {...form.register("warehouse")}
        label={t`Warehouse`}
        isError={!!form.formState.errors.warehouse}
        message={form.formState.errors.warehouse?.message}
      />
      <div className="space-y-2">
        <label className="text-sm font-medium">
          <Trans>Private key (PEM format)</Trans>
        </label>
        <TextArea
          {...form.register("privateKey")}
          placeholder="-----BEGIN PRIVATE KEY-----"
          rows={8}
        />
        {form.formState.errors.privateKey?.message && (
          <p className="text-sm text-warning-600">
            {form.formState.errors.privateKey.message}
          </p>
        )}
      </div>
      <Input
        {...form.register("privateKeyPassphrase")}
        label={t`Private key passphrase (optional)`}
        type="password"
      />
    </div>
  );
});
