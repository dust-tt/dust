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
  RadioButton,
  SliderToggle,
} from "@dust-tt/sparkle";
import type {
  PlanType,
  SupportedEnterpriseConnectionStrategies,
  WorkspaceDomain,
  WorkspaceEnterpriseConnection,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, connectionStrategyToHumanReadable } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useCallback, useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useWorkspaceEnterpriseConnection } from "@app/lib/swr/workspaces";
import type { PostCreateEnterpriseConnectionRequestBodySchemaType } from "@app/pages/api/w/[wId]/enterprise-connection";

interface EnterpriseConnectionDetailsProps {
  owner: WorkspaceType;
  plan: PlanType;
  strategyDetails: EnterpriseConnectionStrategyDetails;
  workspaceVerifiedDomain: WorkspaceDomain | null;
}

export interface EnterpriseConnectionStrategyDetails {
  callbackUrl: string;
  initiateLoginUrl: string;
}

export function EnterpriseConnectionDetails({
  owner,
  plan,
  strategyDetails,
  workspaceVerifiedDomain,
}: EnterpriseConnectionDetailsProps) {
  const [showNoInviteLinkPopup, setShowNoInviteLinkPopup] = useState(false);
  const [showNoVerifiedDomainPopup, setShowNoVerifiedDomainPopup] =
    useState(false);
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
        enterpriseConnection={enterpriseConnection}
        isOpen={isDisableEnterpriseConnectionModalOpened}
        onClose={async (updated: boolean) => {
          setIsDisableEnterpriseConnectionModalOpened(false);

          if (updated) {
            await mutateEnterpriseConnection();
          }
        }}
        owner={owner}
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
        Easily integrate Okta or Microsoft Entra ID to enable Single Sign-On
        (SSO) for your team.
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
              } else if (!workspaceVerifiedDomain) {
                setShowNoVerifiedDomainPopup(true);
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
          className="absolute bottom-8 right-8"
          onClose={() => setShowNoInviteLinkPopup(false)}
        />
        <Popup
          show={showNoVerifiedDomainPopup}
          chipLabel="Domain Verification Required"
          description="Single Sign-On (SSO) is not available because your domain isn't verified yet. Contact us at team@dust.tt for assistance."
          buttonLabel="Get Help"
          buttonClick={() => {
            window.location.href =
              "mailto:team@dust.tt?subject=Help with Domain Verification for SSO";
          }}
          className="absolute bottom-8 right-8"
          onClose={() => setShowNoVerifiedDomainPopup(false)}
        />
      </div>
    </Page.Vertical>
  );
}

function PlatformHelpLink({
  hint,
  link,
  strategy,
}: {
  hint: string;
  link: string;
  strategy: SupportedEnterpriseConnectionStrategies;
}) {
  const basePlatformUrl =
    strategy === "okta"
      ? "https://developer.okta.com/docs/guides/"
      : "https://learn.microsoft.com/en-us/entra/identity-platform/";

  return (
    <div className="flex flex-row items-center space-x-2 text-element-700">
      <span>{hint}</span>
      <IconButton
        icon={ExternalLinkIcon}
        onClick={() => window.open(`${basePlatformUrl}${link}`, "_blank")}
        aria-label={`Open ${link} in a new tab`}
      />
    </div>
  );
}

function CreateOktaEnterpriseConnectionModal({
  createEnterpriseConnection,
  onConnectionCreated,
  strategyDetails,
}: {
  createEnterpriseConnection: (
    enterpriseConnection: PostCreateEnterpriseConnectionRequestBodySchemaType
  ) => Promise<void>;
  onConnectionCreated: () => void;
  strategyDetails: EnterpriseConnectionStrategyDetails;
}) {
  const [enterpriseConnectionDetails, setEnterpriseConnectionDetails] =
    useState<Partial<PostCreateEnterpriseConnectionRequestBodySchemaType>>({
      strategy: "okta",
    });

  const { callbackUrl, initiateLoginUrl } = strategyDetails;

  return (
    <>
      <div>
        Discover how to set up Okta SSO – Read Our{" "}
        <a
          className="font-bold underline decoration-2"
          href="https://docs.dust.tt/docs/okta"
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
            disabled
            className="max-w-sm"
          />
        </div>
        <div>
          Initiate login URI:
          <Input
            name="Initiate login URI"
            placeholder="Initiate login URI"
            value={initiateLoginUrl}
            disabled
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
            onChange={(e) =>
              setEnterpriseConnectionDetails({
                ...enterpriseConnectionDetails,
                domain: e.target.value,
              })
            }
            className="max-w-sm"
          />
          <PlatformHelpLink
            hint="See Okta docs for obtaining your Okta Domain"
            link="find-your-domain/main"
            strategy="okta"
          />
        </div>
        <div>
          Okta Client Id:
          <Input
            name="Okta Client Id"
            placeholder="okta-client-id"
            value={enterpriseConnectionDetails.clientId ?? ""}
            onChange={(e) =>
              setEnterpriseConnectionDetails({
                ...enterpriseConnectionDetails,
                clientId: e.target.value,
              })
            }
            className="max-w-sm"
          />
          <PlatformHelpLink
            hint="How to obtain your Okta Client ID?"
            link="find-your-app-credentials/main"
            strategy="okta"
          />
        </div>
        <div>
          Okta Client Secret:
          <Input
            name="Okta Client Secret"
            placeholder="okta-client-secret"
            value={enterpriseConnectionDetails.clientSecret ?? ""}
            onChange={(e) =>
              setEnterpriseConnectionDetails({
                ...enterpriseConnectionDetails,
                clientSecret: e.target.value,
              })
            }
            className="max-w-sm"
          />
          <PlatformHelpLink
            hint="How to obtain your Okta Client ID?"
            link="find-your-app-credentials/main"
            strategy="okta"
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
                enterpriseConnectionDetails as PostCreateEnterpriseConnectionRequestBodySchemaType
              );
              onConnectionCreated();
            }}
            hasMagnifying={true}
          />
        </div>
      </Page.Layout>
    </>
  );
}

function CreateWAADEnterpriseConnectionModal({
  createEnterpriseConnection,
  onConnectionCreated,
  strategyDetails,
}: {
  createEnterpriseConnection: (
    enterpriseConnection: PostCreateEnterpriseConnectionRequestBodySchemaType
  ) => Promise<void>;
  onConnectionCreated: () => void;
  strategyDetails: EnterpriseConnectionStrategyDetails;
}) {
  const [enterpriseConnectionDetails, setEnterpriseConnectionDetails] =
    useState<Partial<PostCreateEnterpriseConnectionRequestBodySchemaType>>({
      strategy: "waad",
    });

  const { callbackUrl, initiateLoginUrl } = strategyDetails;

  return (
    <>
      <div>
        Discover how to set up Microsoft Entra ID SSO – Read Our{" "}
        <a
          className="font-bold underline decoration-2"
          href="https://docs.dust.tt/docs/microsoft-entra-sso"
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
            value={`https://${callbackUrl}/login/callback`}
            disabled
            className="max-w-sm"
          />
        </div>
        <div>
          Initiate login URI:
          <Input
            name="Initiate login URI"
            placeholder="Initiate login URI"
            value={initiateLoginUrl}
            disabled
            className="max-w-sm"
          />
        </div>
        <Page.Separator />
        <div>
          Microsoft Domain:
          <Input
            name="Microsoft Domain"
            placeholder="<account_prefix>.onmicrosoft.com"
            value={enterpriseConnectionDetails.domain ?? ""}
            onChange={(e) =>
              setEnterpriseConnectionDetails({
                ...enterpriseConnectionDetails,
                domain: e.target.value,
              })
            }
            className="max-w-sm"
          />
        </div>
        <div>
          Microsoft Client Id:
          <Input
            name="Microsoft Client Id"
            placeholder="microsoft-client-id"
            value={enterpriseConnectionDetails.clientId ?? ""}
            onChange={(e) =>
              setEnterpriseConnectionDetails({
                ...enterpriseConnectionDetails,
                clientId: e.target.value,
              })
            }
            className="max-w-sm"
          />
          <PlatformHelpLink
            hint="How to create your Microsoft App?"
            link="quickstart-register-app?tabs=certificate"
            strategy="waad"
          />
        </div>
        <div>
          Microsoft Client Secret:
          <Input
            name="Microsoft Client Secret"
            placeholder="microsoft-client-secret"
            value={enterpriseConnectionDetails.clientSecret ?? ""}
            onChange={(e) =>
              setEnterpriseConnectionDetails({
                ...enterpriseConnectionDetails,
                clientSecret: e.target.value,
              })
            }
            className="max-w-sm"
          />
          <PlatformHelpLink
            hint="How to create your Microsoft App?"
            link="quickstart-register-app?tabs=certificate"
            strategy="waad"
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
            label="Create Microsoft Entra ID Configuration"
            onClick={async () => {
              await createEnterpriseConnection(
                enterpriseConnectionDetails as PostCreateEnterpriseConnectionRequestBodySchemaType
              );
              onConnectionCreated();
            }}
            hasMagnifying={true}
          />
        </div>
      </Page.Layout>
    </>
  );
}

function StrategyModalContent({
  onConnectionCreated,
  owner,
  strategy,
  strategyDetails,
}: {
  onConnectionCreated: () => void;
  owner: WorkspaceType;
  strategy: SupportedEnterpriseConnectionStrategies;
  strategyDetails: EnterpriseConnectionStrategyDetails;
}) {
  const sendNotification = useContext(SendNotificationsContext);

  const createEnterpriseConnection = useCallback(
    async (
      enterpriseConnection: PostCreateEnterpriseConnectionRequestBodySchemaType
    ) => {
      const res = await fetch(`/api/w/${owner.sId}/enterprise-connection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(enterpriseConnection),
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

  switch (strategy) {
    case "okta":
      return (
        <CreateOktaEnterpriseConnectionModal
          createEnterpriseConnection={createEnterpriseConnection}
          onConnectionCreated={onConnectionCreated}
          strategyDetails={strategyDetails}
        />
      );

    case "waad":
      return (
        <CreateWAADEnterpriseConnectionModal
          createEnterpriseConnection={createEnterpriseConnection}
          onConnectionCreated={onConnectionCreated}
          strategyDetails={strategyDetails}
        />
      );

    case "samlp":
      return <>Not implemented</>;

    default:
      assertNever(strategy);
  }
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
  const [selectedStrategy, setSelectedStrategy] =
    useState<SupportedEnterpriseConnectionStrategies | null>(null);

  return (
    <Modal
      isOpen={isOpen}
      title={"Create Single Sign On configuration"}
      onClose={() => {
        onClose(false);
        setSelectedStrategy(null);
      }}
      hasChanged={false}
      variant="side-sm"
    >
      <Page variant="modal">
        {selectedStrategy === null && (
          <div className="flex flex-col gap-4">
            <Page.P variant="secondary">
              Dust supports Single Sign On (SSO) with Okta and Microsoft Entra
              Id. Choose the SSO provider you'd like to integrate.
            </Page.P>
            <RadioButton
              name="strategy"
              className="s-flex-col"
              choices={[
                {
                  label: "Okta SSO",
                  value: "okta",
                  disabled: false,
                },
                {
                  label: "Microsoft Entra Id",
                  value: "waad",
                  disabled: false,
                },
              ]}
              value={selectedStrategy ?? ""}
              onChange={(v) => {
                setSelectedStrategy(
                  v as SupportedEnterpriseConnectionStrategies
                );
              }}
            />
          </div>
        )}
        {selectedStrategy && (
          <StrategyModalContent
            onConnectionCreated={() => {
              onClose(true);
            }}
            owner={owner}
            strategy={selectedStrategy}
            strategyDetails={strategyDetails}
          />
        )}
      </Page>
    </Modal>
  );
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
  enterpriseConnection,
  isOpen,
  onClose,
  owner,
}: {
  enterpriseConnection: WorkspaceEnterpriseConnection | null;
  isOpen: boolean;
  onClose: (updated: boolean) => void;
  owner: WorkspaceType;
}) {
  const sendNotification = useContext(SendNotificationsContext);

  if (!enterpriseConnection) {
    return <></>;
  }

  const strategyHumanReadable = connectionStrategyToHumanReadable(
    enterpriseConnection.strategy
  );

  async function handleUpdateWorkspace(): Promise<void> {
    const res = await fetch(`/api/w/${owner.sId}/enterprise-connection`, {
      method: "DELETE",
    });
    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Disable Single Sign On failed",
        description: `Failed to disable ${strategyHumanReadable} Single Sign On.`,
      });
    } else {
      sendNotification({
        type: "success",
        title: "Single Sign On disabled",
        description: `${strategyHumanReadable} Single Sign On disabled.`,
      });
    }

    onClose(true);
  }

  return (
    <Dialog
      isOpen={isOpen}
      title={`Disable ${strategyHumanReadable} Single Sign On`}
      onValidate={async () => {
        await handleUpdateWorkspace();
      }}
      onCancel={() => onClose(false)}
      validateLabel={`Disable ${strategyHumanReadable} Single Sign On`}
      validateVariant="primaryWarning"
    >
      <div>
        Anyone with an {strategyHumanReadable} account won't be able to access
        your Dust workspace anymore.
      </div>
    </Dialog>
  );
}
