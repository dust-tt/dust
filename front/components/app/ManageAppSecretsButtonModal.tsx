import {
  BracesIcon,
  Button,
  Dialog,
  Input,
  Modal,
  Page,
  PlusIcon,
} from "@dust-tt/sparkle";
import type { DustAppSecretType, WorkspaceType } from "@dust-tt/types";
import { useState } from "react";
import { useContext } from "react";
import { useSWRConfig } from "swr";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useDustAppSecrets } from "@app/lib/swr/apps";
import { classNames } from "@app/lib/utils";

export function DustAppSecrets({ owner }: { owner: WorkspaceType }) {
  const { mutate } = useSWRConfig();
  const defaultSecret = { name: "", value: "" };
  const [newDustAppSecret, setNewDustAppSecret] =
    useState<DustAppSecretType>(defaultSecret);
  const [secretToRevoke, setSecretToRevoke] =
    useState<DustAppSecretType | null>(null);
  const [isNewSecretPromptOpen, setIsNewSecretPromptOpen] = useState(false);
  const [isInputNameDisabled, setIsInputNameDisabled] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);

  const { secrets } = useDustAppSecrets(owner);

  const { submit: handleGenerate, isSubmitting: isGenerating } =
    useSubmitFunction(async (secret: DustAppSecretType) => {
      await fetch(`/api/w/${owner.sId}/dust_app_secrets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: secret.name, value: secret.value }),
      });
      await mutate(`/api/w/${owner.sId}/dust_app_secrets`);
      setIsNewSecretPromptOpen(false);
      setNewDustAppSecret(defaultSecret);
      sendNotification({
        type: "success",
        title: "Secret saved",
        description: "Successfully saved the secret value securely.",
      });
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
          isOpen={true}
          title={`Delete ${secretToRevoke?.name}`}
          onValidate={() => handleRevoke(secretToRevoke)}
          onCancel={() => setSecretToRevoke(null)}
        >
          <p className="text-sm text-gray-700">
            Are you sure you want to delete the secret{" "}
            <strong>{secretToRevoke?.name}</strong>?
          </p>
        </Dialog>
      ) : null}
      <Dialog
        isOpen={isNewSecretPromptOpen}
        title={`${isInputNameDisabled ? "Update" : "New"} Developer Secret`}
        onValidate={() => handleGenerate(newDustAppSecret)}
        onCancel={() => setIsNewSecretPromptOpen(false)}
      >
        <Input
          name="Secret Name"
          placeholder="SECRET_NAME"
          value={newDustAppSecret.name}
          disabled={isInputNameDisabled}
          onChange={(e) =>
            setNewDustAppSecret({
              ...newDustAppSecret,
              name: cleanSecretName(e.target.name),
            })
          }
        />
        <p className="text-xs text-gray-500">
          Secret names must be alphanumeric and underscore characters only.
        </p>
        <br />

        <Input
          name="Secret value"
          placeholder="Type the secret value"
          value={newDustAppSecret.value}
          onChange={(e) =>
            setNewDustAppSecret({ ...newDustAppSecret, value: e.target.value })
          }
        />
        <p className="text-xs text-gray-500">
          Secret values are encrypted and stored securely in our database.
        </p>
      </Dialog>
      <Page.SectionHeader
        title="Developer Secrets"
        description="Secrets usable in Dust apps to avoid showing sensitive data in blocks definitions."
        action={{
          label: "Create Developer Secret",
          variant: "primary",
          onClick: async () => {
            setNewDustAppSecret(defaultSecret);
            setIsInputNameDisabled(false);
            setIsNewSecretPromptOpen(true);
          },
          icon: PlusIcon,
          disabled: isGenerating || isRevoking,
        }}
      />
      <div className="space-y-4 divide-y divide-gray-200">
        <table className="pt-4">
          <tbody>
            {secrets
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((secret) => (
                <tr key={secret.name}>
                  <td className="px-2 py-4">
                    <pre className="bg-zinc-100 p-2 text-sm">
                      secrets.{secret.name}
                    </pre>
                  </td>
                  <td>→</td>
                  <td className="w-full px-2 py-4">
                    <p
                      className={classNames(
                        "font-mono truncate text-sm text-slate-700"
                      )}
                    >
                      {secret.value}
                    </p>
                  </td>
                  <td className="px-2">
                    <Button
                      variant="secondary"
                      disabled={isRevoking || isGenerating}
                      onClick={async () => {
                        handleUpdate(secret);
                      }}
                      label="Update"
                    />
                  </td>
                  <td>
                    <Button
                      variant="secondaryWarning"
                      disabled={isRevoking || isGenerating}
                      onClick={async () => {
                        setSecretToRevoke(secret);
                      }}
                      label="Delete"
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const ManageAppSecretsButtonModal = ({
  owner,
}: {
  owner: WorkspaceType;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Dev secrets"
        variant="primary"
        icon={BracesIcon}
        size="sm"
        onClick={() => {
          setIsOpen(true);
        }}
      />
      <Modal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
        }}
        hasChanged={false} // There's no current state to save/cancel on this modal.
        title="Secrets"
        variant="side-md"
      >
        <Page variant="modal">
          <Page.Vertical sizing="grow">
            <DustAppSecrets owner={owner} />
          </Page.Vertical>
        </Page>
      </Modal>
    </>
  );
};
