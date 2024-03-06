import {
  Button,
  Dialog,
  ExternalLinkIcon,
  IconButton,
  Input,
  LockIcon,
  Modal,
  Page,
  Popup,
} from "@dust-tt/sparkle";
import type {
  PlanType,
  SupportedEnterpriseConnectionStrategies,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useWorkspaceEnterpriseConnection } from "@app/lib/swr";

interface EnterpriseConnectionDetailsProps {
  owner: WorkspaceType;
  plan: PlanType;
  strategy?: SupportedEnterpriseConnectionStrategies;
}

export function EnterpriseConnectionDetails({
  owner,
  plan,
  strategy = "okta",
}: EnterpriseConnectionDetailsProps) {
  const [showNoInviteLinkPopup, setShowNoInviteLinkPopup] = useState(false);
  const [
    isEnterpriseConnectionModalOpened,
    setIsEnterpriseConnectionModalOpened,
  ] = useState(false);
  const [
    isDisableEnterpriseConnectionModalOpened,
    setIsDisableEnterpriseConnectionModalOpened,
  ] = useState(false);

  const router = useRouter();

  const { enterpriseConnection, mutateEnterpriseConnection } =
    useWorkspaceEnterpriseConnection({
      workspaceId: owner.sId,
    });

  return (
    <Page.Vertical gap="sm">
      <Page.H variant="h5">Single Sign On</Page.H>
      <CreateEnterpriseConnectionModal
        owner={owner}
        isOpen={isEnterpriseConnectionModalOpened}
        onClose={async (created: boolean) => {
          if (created) {
            await mutateEnterpriseConnection();
          }

          setIsEnterpriseConnectionModalOpened(false);
        }}
        strategy={strategy}
      />
      <DisableEnterpriseConnectionModal
        enterpriseConnectionEnabled={!!enterpriseConnection}
        isOpen={isDisableEnterpriseConnectionModalOpened}
        onClose={async (updated: boolean) => {
          setIsDisableEnterpriseConnectionModalOpened(false);

          if (updated) {
            await mutateEnterpriseConnection();
          }
        }}
        owner={owner}
        strategy={strategy}
      />
      <Page.P variant="secondary">
        Easily integrate {strategy} to enable Single Sign-On (SSO) for your
        team.
      </Page.P>
      <div className="flex flex-col items-start gap-3">
        {enterpriseConnection ? (
          <Button
            label="De-activate Single Sign On"
            size="sm"
            variant="secondaryWarning"
            disabled={!enterpriseConnection}
            onClick={() => {
              setIsDisableEnterpriseConnectionModalOpened(true);
            }}
          />
        ) : (
          <Button
            label="Activate Single Sign On"
            size="sm"
            variant="primary"
            disabled={!!enterpriseConnection}
            onClick={() => {
              if (!isUpgraded(plan)) {
                setShowNoInviteLinkPopup(true);
              } else {
                setIsEnterpriseConnectionModalOpened(true);
              }
            }}
          />
        )}
        <Popup
          show={showNoInviteLinkPopup}
          chipLabel="Free plan"
          description="You cannot enable auto-join with the free plan. Upgrade your plan to invite other members."
          buttonLabel="Check Dust plans"
          buttonClick={() => {
            void router.push(`/w/${owner.sId}/subscription`);
          }}
          className="absolute bottom-8 right-0"
          onClose={() => setShowNoInviteLinkPopup(false)}
        />
      </div>
    </Page.Vertical>
  );
}

function OktaHelpLink({ hint, link }: { hint: string; link: string }) {
  return (
    <div className="flex flex-row items-center space-x-2 text-element-700">
      <span>{hint}</span>
      <IconButton
        icon={ExternalLinkIcon}
        onClick={() =>
          window.open(
            `https://developer.okta.com/docs/guides/${link}`,
            "_blank"
          )
        }
        aria-label={`Open ${link} in a new tab`}
      />
    </div>
  );
}

function CreateEnterpriseConnectionModal({
  isOpen,
  onClose,
  owner,
  strategy,
}: {
  isOpen: boolean;
  onClose: (created: boolean) => void;
  owner: WorkspaceType;
  strategy: SupportedEnterpriseConnectionStrategies;
}) {
  const [enterpriseConnectionDetails, setEnterpriseConnectionDetails] =
    useState<{
      clientId?: string;
      clientSecret?: string;
      domain?: string;
    }>({});

  const sendNotification = useContext(SendNotificationsContext);

  const createEnterpriseConnection = async () => {
    const res = await fetch(`/api/w/${owner.sId}/enterprise-connection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        strategy,
        ...enterpriseConnectionDetails,
      }),
    });
    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Update failed",
        description: `Failed to create ${strategy} Single Sign On configuration.`,
      });
    } else {
      sendNotification({
        type: "success",
        title: "SSO configuration created",
        description: "Single Sign On configuration created.",
      });
    }
  };

  // TODO: Make Generic!
  return (
    <Modal
      isOpen={isOpen}
      title={`Create ${strategy} Single Sign On configuration`}
      onClose={() => onClose(false)}
      hasChanged={false}
      variant="side-sm"
    >
      <Page variant="modal">
        <Page.Layout direction="vertical">
          <Page.P>
            Okta Domain:
            <Input
              name="Okta Domain"
              placeholder="mydomain.okta.com"
              value={enterpriseConnectionDetails.domain ?? ""}
              onChange={(value) =>
                setEnterpriseConnectionDetails({
                  ...enterpriseConnectionDetails,
                  domain: value,
                })
              }
              className="max-w-sm"
            />
            <OktaHelpLink
              hint="See Okta docs for obtaining your Okta Domain"
              link="find-your-domain/main"
            />
          </Page.P>
          <Page.P>
            Okta Client Id:
            <Input
              name="Okta Client Id"
              placeholder="okta-client-id"
              value={enterpriseConnectionDetails.clientId ?? ""}
              onChange={(value) =>
                setEnterpriseConnectionDetails({
                  ...enterpriseConnectionDetails,
                  clientId: value,
                })
              }
              className="max-w-sm"
            />
            <OktaHelpLink
              hint="How to obtain your Okta Client ID?"
              link="find-your-app-credentials/main"
            />
          </Page.P>
          <Page.P>
            Okta Client Secret:
            <Input
              name="Okta Client Secret"
              placeholder="okta-client-secret"
              value={enterpriseConnectionDetails.clientSecret ?? ""}
              onChange={(value) =>
                setEnterpriseConnectionDetails({
                  ...enterpriseConnectionDetails,
                  clientSecret: value,
                })
              }
              className="max-w-sm"
            />
            <OktaHelpLink
              hint="How to obtain your Okta Client ID?"
              link="find-your-app-credentials/main"
            />
          </Page.P>
          <Page.Separator />
          <div className="flex items-start">
            <Button
              variant="primaryWarning"
              size="sm"
              disabled={
                !(
                  enterpriseConnectionDetails.clientId &&
                  enterpriseConnectionDetails.clientSecret &&
                  enterpriseConnectionDetails.domain
                )
              }
              icon={LockIcon}
              label="Create Okta Configuration"
              onClick={async () => {
                await createEnterpriseConnection();
                onClose(true);
              }}
              hasMagnifying={true}
            />
          </div>
        </Page.Layout>
      </Page>
    </Modal>
  );
}

function DisableEnterpriseConnectionModal({
  isOpen,
  onClose,
  owner,
  strategy,
}: {
  enterpriseConnectionEnabled: boolean;
  isOpen: boolean;
  onClose: (updated: boolean) => void;
  owner: WorkspaceType;
  strategy: SupportedEnterpriseConnectionStrategies;
}) {
  const sendNotification = useContext(SendNotificationsContext);

  async function handleUpdateWorkspace(): Promise<void> {
    const res = await fetch(`/api/w/${owner.sId}/enterprise-connection`, {
      method: "DELETE",
    });
    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Disable Single Sign On failed",
        description: `Failed to disable ${strategy} Single Sign On.`,
      });
    } else {
      sendNotification({
        type: "success",
        title: "Single Sign On disabled",
        description: `${strategy} Single Sign On disable.`,
      });
    }

    onClose(true);
  }

  return (
    <Dialog
      isOpen={isOpen}
      title={`Disable ${strategy} Single Sign On`}
      onValidate={async () => {
        await handleUpdateWorkspace();
      }}
      onCancel={() => onClose(false)}
      validateLabel={`Disable ${strategy} Single Sign On`}
      validateVariant="primaryWarning"
    >
      <div>
        Anyone with an {strategy} account won't be able to access your Dust
        workspace anymore.
      </div>
    </Dialog>
  );
}
