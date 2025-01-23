import {
  BookOpenIcon,
  BracesIcon,
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Page,
  PlusIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  DustAppSecretType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useState } from "react";
import { useSWRConfig } from "swr";

import { subNavigationAdmin } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useDustAppSecrets } from "@app/lib/swr/apps";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
}>(async (_, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();

  if (!auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
    },
  };
});

export default function SecretsPage({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { mutate } = useSWRConfig();
  const defaultSecret = { name: "", value: "" };
  const [newDustAppSecret, setNewDustAppSecret] =
    useState<DustAppSecretType>(defaultSecret);
  const [secretToRevoke, setSecretToRevoke] =
    useState<DustAppSecretType | null>(null);
  const [isNewSecretPromptOpen, setIsNewSecretPromptOpen] = useState(false);
  const [isInputNameDisabled, setIsInputNameDisabled] = useState(false);
  const sendNotification = useSendNotification();

  const { secrets } = useDustAppSecrets(owner);

  const { submit: handleGenerate, isSubmitting: isGenerating } =
    useSubmitFunction(async (secret: DustAppSecretType) => {
      const r = await fetch(`/api/w/${owner.sId}/dust_app_secrets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: secret.name, value: secret.value }),
      });
      if (r.ok) {
        await mutate(`/api/w/${owner.sId}/dust_app_secrets`);
        setIsNewSecretPromptOpen(false);
        setNewDustAppSecret(defaultSecret);
        sendNotification({
          type: "success",
          title: "Secret saved",
          description: "Successfully saved the secret value securely.",
        });
      } else {
        const msg = await r.text();
        sendNotification({
          type: "error",
          title: "Error saving secret",
          description: `An error occurred while saving the secret value: ${msg}`,
        });
      }
    });

  const { submit: handleRevoke, isSubmitting: isRevoking } = useSubmitFunction(
    async (secret: DustAppSecretType) => {
      await fetch(
        `/api/w/${owner.sId}/dust_app_secrets/${secret.name}/destroy`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      await mutate(`/api/w/${owner.sId}/dust_app_secrets`);
      setSecretToRevoke(null);
      sendNotification({
        type: "success",
        title: "Secret deleted",
        description: `Successfully deleted ${secret.name}.`,
      });
    }
  );

  const cleanSecretName = (name: string) => {
    return name.replace(/[^a-zA-Z0-9_]/g, "").toUpperCase();
  };

  const handleUpdate = (secret: DustAppSecretType) => {
    setNewDustAppSecret({ ...secret, value: "" });
    setIsNewSecretPromptOpen(true);
    setIsInputNameDisabled(true);
  };

  return (
    <>
      {secretToRevoke ? (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setSecretToRevoke(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {secretToRevoke?.name}</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              Are you sure you want to delete the secret{" "}
              <strong>{secretToRevoke?.name}</strong>?
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
                onClick: () => setSecretToRevoke(null),
              }}
              rightButtonProps={{
                label: "Delete",
                variant: "warning",
                onClick: () => handleRevoke(secretToRevoke),
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
      <Dialog
        open={isNewSecretPromptOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsNewSecretPromptOpen(false);
          }
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {isInputNameDisabled ? "Update" : "New"} Developer Secret
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <Input
              message="Secret names must be alphanumeric and underscore characters only."
              name="Secret Name"
              placeholder="SECRET_NAME"
              value={newDustAppSecret.name}
              disabled={isInputNameDisabled}
              onChange={(e) =>
                setNewDustAppSecret({
                  ...newDustAppSecret,
                  name: cleanSecretName(e.target.value),
                })
              }
            />
            <Input
              message="Secret values are encrypted and stored securely in our database."
              name="Secret value"
              placeholder="Type the secret value"
              value={newDustAppSecret.value}
              onChange={(e) =>
                setNewDustAppSecret({
                  ...newDustAppSecret,
                  value: e.target.value,
                })
              }
            />
            <p className="text-xs text-gray-500"></p>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setIsNewSecretPromptOpen(false),
            }}
            rightButtonProps={{
              label: isInputNameDisabled ? "Update" : "Create",
              variant: "primary",
              onClick: () => handleGenerate(newDustAppSecret),
            }}
          />
        </DialogContent>
      </Dialog>

      <AppLayout
        subscription={subscription}
        owner={owner}
        subNavigation={subNavigationAdmin({ owner, current: "dev_secrets" })}
      >
        <Page.Vertical gap="xl" align="stretch">
          <Page.Header
            title="Developer Secrets"
            icon={BracesIcon}
            description="Secrets usable in Dust apps to avoid showing sensitive data in blocks definitions."
          />{" "}
          <Page.Vertical align="stretch" gap="md">
            <Page.Horizontal align="stretch">
              <div className="w-full" />
              <Button
                label="Read the API reference"
                size="sm"
                variant="outline"
                icon={BookOpenIcon}
                onClick={() => {
                  window.open(
                    "https://docs.dust.tt/reference/developer-platform-overview#developer-secrets",
                    "_blank"
                  );
                }}
              />
              <Button
                label="Create Developer Secret"
                variant="primary"
                onClick={async () => {
                  setNewDustAppSecret(defaultSecret);
                  setIsInputNameDisabled(false);
                  setIsNewSecretPromptOpen(true);
                }}
                icon={PlusIcon}
                disabled={isGenerating || isRevoking}
              />
            </Page.Horizontal>
            <div className="w-full space-y-4 divide-y divide-gray-200">
              <div className="flex w-full flex-col space-y-4 pt-4">
                {secrets
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((secret) => (
                    <div
                      key={secret.name}
                      className="flex items-center space-x-4"
                    >
                      <div className="flex-none">
                        <pre className="bg-zinc-100 p-2 text-sm">
                          secrets.{secret.name}
                        </pre>
                      </div>
                      <div className="flex-none">→</div>
                      <div className="flex-grow overflow-hidden">
                        <p className="font-mono truncate text-sm text-slate-700">
                          {secret.value}
                        </p>
                      </div>
                      <div className="flex-none px-2">
                        <Button
                          variant="outline"
                          disabled={isRevoking || isGenerating}
                          onClick={async () => {
                            handleUpdate(secret);
                          }}
                          label="Update"
                        />
                      </div>
                      <div className="flex-none">
                        <Button
                          variant="warning"
                          disabled={isRevoking || isGenerating}
                          onClick={async () => {
                            setSecretToRevoke(secret);
                          }}
                          label="Delete"
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </Page.Vertical>
        </Page.Vertical>
        <div className="h-12" />
      </AppLayout>
    </>
  );
}
