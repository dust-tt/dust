import {
  Button,
  Dialog,
  ExternalLinkIcon,
  Icon,
  IconButton,
  Input,
  LockIcon,
  Modal,
  Page,
  Popup,
  SliderToggle,
} from "@dust-tt/sparkle";
import type {
  PlanType,
  SupportedEnterpriseConnectionStrategies,
  WorkspaceEnterpriseConnection,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import { useCallback, useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useWorkspaceEnterpriseConnection } from "@app/lib/swr";

interface EnterpriseConnectionDetailsProps {
  owner: WorkspaceType;
  plan: PlanType;
  strategyDetails: EnterpriseConnectionStrategyDetails;
}

export interface EnterpriseConnectionStrategyDetails {
  callbackUrl: string;
  initiateLoginUrl: string;
  strategy: SupportedEnterpriseConnectionStrategies;
}

export function EnterpriseConnectionDetails({
  owner,
  plan,
  strategyDetails,
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
  const [
    isToggleEnforceEnterpriseConnectionModalOpened,
    setIsToggleEnforceEnterpriseConnectionModalOpened,
  ] = useState(false);

  const router = useRouter();

  const { enterpriseConnection, mutateEnterpriseConnection } =
    useWorkspaceEnterpriseConnection({
      workspaceId: owner.sId,
    });

  if (!owner.flags.includes("okta_enterprise_connection")) {
    return <></>;
  }

  const { strategy } = strategyDetails;

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
        strategyDetails={strategyDetails}
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
      <ToggleEnforceEnterpriseConnectionModal
        isOpen={isToggleEnforceEnterpriseConnectionModalOpened}
        onClose={async (updated: boolean) => {
          setIsToggleEnforceEnterpriseConnectionModalOpened(false);

          if (updated) {
            // We perform a full refresh so that the Workspace name updates and we get a fresh owner
            // object so that the formValidation logic keeps working.
            window.location.reload();
          }
        }}
        owner={owner}
      />
      <Page.P variant="secondary">
        Easily integrate {strategy} to enable Single Sign-On (SSO) for your
        team.
      </Page.P>
      <div className="flex w-full flex-col items-start gap-3">
        {enterpriseConnection ? (
          <div className="w-full space-y-4">
            <Button
              label="De-activate Single Sign On"
              size="sm"
              variant="secondaryWarning"
              disabled={!enterpriseConnection}
              onClick={() => {
                setIsDisableEnterpriseConnectionModalOpened(true);
              }}
            />
            <div className="flex flex-col space-y-4">
              <div className="flex flex-row items-center space-x-2">
                <Icon visual={LockIcon} />
                <p className="grow">Enforce SSO login</p>
                <SliderToggle
                  selected={owner.ssoEnforced}
                  onClick={async () => {
                    setIsToggleEnforceEnterpriseConnectionModalOpened(true);
                  }}
                />
              </div>
              <Page.P variant="secondary">
                When SSO is enforced, users will no longer be able to use social
                logins and will be redirected to the SSO portal.
              </Page.P>
            </div>
          </div>
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

function CreateOktaEnterpriseConnectionModal({
  isOpen,
  onClose,
  owner,
  strategyDetails,
}: {
  isOpen: boolean;
  onClose: (created: boolean) => void;
  owner: WorkspaceType;
  strategyDetails: EnterpriseConnectionStrategyDetails;
}) {
  const [enterpriseConnectionDetails, setEnterpriseConnectionDetails] =
    useState<{
      clientId?: string;
      clientSecret?: string;
      domain?: string;
    }>({});

  const { callbackUrl, initiateLoginUrl } = strategyDetails;

  const sendNotification = useContext(SendNotificationsContext);

  const createEnterpriseConnection = useCallback(
    async (enterpriseConnection: WorkspaceEnterpriseConnection) => {
      const res = await fetch(`/api/w/${owner.sId}/enterprise-connection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          strategy: "okta",
          ...enterpriseConnection,
        }),
      });
      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Update failed",
          description: "Failed to create Okta Single Sign On configuration.",
        });
      } else {
        sendNotification({
          type: "success",
          title: "SSO configuration created",
          description: "Okta Single Sign On configuration created.",
        });
      }
    },
    [owner, sendNotification]
  );

  return (
    <Modal
      isOpen={isOpen}
      title={"Create Okta Single Sign On configuration"}
      onClose={() => onClose(false)}
      hasChanged={false}
      variant="side-sm"
    >
      <Page variant="modal">
        <div>
          Discover how to set up Okta SSO – Read Our{" "}
          <a
            className="font-bold underline decoration-2"
            href="https://docs.dust.tt/docs/single-sign-on-sso"
            target="_blank"
          >
            Documentation
          </a>
          .
        </div>
        <Page.Layout direction="vertical">
          <div>
            Callback URL:
            <Input
              name="Callback URL"
              placeholder="Callback url"
              value={callbackUrl}
              disabled={true}
              className="max-w-sm"
            />
          </div>
          <div>
            Initiate login URI:
            <Input
              name="Initiate login URI"
              placeholder="Initiate login URI"
              value={initiateLoginUrl}
              disabled={true}
              className="max-w-sm"
            />
          </div>
          <Page.Separator />
          <div>
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
          </div>
          <div>
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
          </div>
          <div>
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
          </div>
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
                await createEnterpriseConnection(
                  enterpriseConnectionDetails as WorkspaceEnterpriseConnection
                );
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

function CreateEnterpriseConnectionModal({
  isOpen,
  onClose,
  owner,
  strategyDetails,
}: {
  isOpen: boolean;
  onClose: (created: boolean) => void;
  owner: WorkspaceType;
  strategyDetails: EnterpriseConnectionStrategyDetails;
}) {
  switch (strategyDetails.strategy) {
    case "okta":
      return (
        <CreateOktaEnterpriseConnectionModal
          isOpen={isOpen}
          onClose={onClose}
          owner={owner}
          strategyDetails={strategyDetails}
        />
      );

    default:
      return <></>;
  }
}

function ToggleEnforceEnterpriseConnectionModal({
  isOpen,
  onClose,
  owner,
}: {
  isOpen: boolean;
  onClose: (updated: boolean) => void;
  owner: WorkspaceType;
}) {
  const sendNotification = useContext(SendNotificationsContext);

  const titleAndContent = {
    enforce: {
      title: "Enable Single Sign On Enforcement",
      content: `
        By enforcing SSO, access through social media logins will be discontinued.
        Instead, you'll be directed to sign in via the SSO portal.
        Please note, this change will require all users to sign out and reconnect using SSO.
      `,
      validateLabel: "Enforce Single Sign On",
    },
    remove: {
      title: "Disable Single Sign On Enforcement",
      content: `By disabling SSO enforcement, users will have the flexibility to login with social media.`,
      validateLabel: "Disable Single Sign-On Enforcement",
    },
  };

  const handleToggleSsoEnforced = useCallback(
    async (ssoEnforced: boolean) => {
      const res = await fetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ssoEnforced,
        }),
      });

      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Update failed",
          description: `Failed to enforce sso on workspace.`,
        });
      } else {
        onClose(true);
      }
    },
    [owner, sendNotification, onClose]
  );

  const dialog = titleAndContent[owner.ssoEnforced ? "remove" : "enforce"];

  return (
    <Dialog
      isOpen={isOpen}
      title={dialog.title}
      onValidate={async () => {
        await handleToggleSsoEnforced(!owner.ssoEnforced);
      }}
      onCancel={() => onClose(false)}
      validateLabel={dialog.validateLabel}
      validateVariant="primaryWarning"
    >
      <div>{dialog.content}</div>
    </Dialog>
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
