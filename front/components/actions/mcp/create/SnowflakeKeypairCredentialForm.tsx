import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { PostCredentialsResponseBody } from "@app/pages/api/w/[wId]/credentials";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  TextArea,
} from "@dust-tt/sparkle";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
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
  const [isGuideOpen, setIsGuideOpen] = useState(false);
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
      <Collapsible open={isGuideOpen} onOpenChange={setIsGuideOpen}>
        <CollapsibleTrigger hideChevron>
          <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/50 p-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted dark:border-border-night dark:bg-muted-night/50 dark:text-foreground-night dark:hover:bg-muted-night">
            {isGuideOpen ? (
              <ChevronDownIcon className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 shrink-0" />
            )}
            <span>Snowflake Keypair Authentication Setup Guide</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 space-y-4 rounded-lg border border-border bg-background p-4 text-sm dark:border-border-night dark:bg-background-night">
            <p className="text-muted-foreground dark:text-muted-foreground-night">
              Create a service account with key-pair authentication in your
              Snowflake account. Run these SQL commands as an{" "}
              <strong>ACCOUNTADMIN</strong>:
            </p>
            <div className="space-y-3">
              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  1. Generate an RSA key pair (run locally):
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs dark:bg-muted-night">
                  {`openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8
openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub`}
                </pre>
              </div>
              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  2. Create a service user and assign the public key:
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs dark:bg-muted-night">
                  {`CREATE USER dust_service_user
  RSA_PUBLIC_KEY='<paste contents of rsa_key.pub>'
  DEFAULT_ROLE = <ROLE>
  DEFAULT_WAREHOUSE = <WAREHOUSE>;

GRANT ROLE <ROLE> TO USER dust_service_user;`}
                </pre>
              </div>
            </div>
            <p className="text-muted-foreground dark:text-muted-foreground-night">
              Then paste the <strong>private key</strong> (contents of{" "}
              <code className="rounded bg-muted px-1 dark:bg-muted-night">
                rsa_key.p8
              </code>
              ) into the form below together with the account, username, role,
              and warehouse.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>

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
