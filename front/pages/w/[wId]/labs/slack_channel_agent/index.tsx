import {
  Breadcrumbs,
  CodeBlock,
  CollapsibleComponent,
  Page,
  TestTubeIcon,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useEffect, useState } from "react";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { SlackConfiguration } from "@app/components/labs/slack_channel_agent/ProcessingConfiguration";
import { SlackConnection } from "@app/components/labs/slack_channel_agent/SlackConnection";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useSendNotification } from "@app/hooks/useNotification";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import type {
  LightAgentConfigurationType,
  SubscriptionType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import { setupOAuthConnection } from "@app/types";
import type { LabsSlackChannelAgentConfigurationType } from "@app/types/labs";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  featureFlags: WhitelistableFeature[];
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();

  if (!owner || !subscription || !user || !auth.isAdmin()) {
    return { notFound: true };
  }

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("labs_slack_channel_agent")) {
    return { notFound: true };
  }

  return {
    props: {
      owner,
      subscription,
      featureFlags,
    },
  };
});

export default function LabsSlackChannelAgentIndex({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [channelId, setChannelId] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [savedConfig, setSavedConfig] =
    useState<LabsSlackChannelAgentConfigurationType | null>(null);
  const [selectedAgent, setSelectedAgent] =
    useState<LightAgentConfigurationType | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const sendNotification = useSendNotification();

  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    sort: "priority",
  });

  const activeAgents = agentConfigurations.filter((a) => a.status === "active");

  useEffect(() => {
    const load = async () => {
      const r = await fetch(`/api/w/${owner.sId}/labs/slack_channel_agent`);
      if (r.ok) {
        const j = await r.json();
        const config: LabsSlackChannelAgentConfigurationType = j.configuration;
        setSavedConfig(config);

        if (config) {
          setChannelId(config.channelId || "");
          setIsEnabled(config.isEnabled);

          if (config.agentConfigurationId) {
            const agent = agentConfigurations.find(
              (a) => a.sId === config.agentConfigurationId
            );
            setSelectedAgent(agent || null);
          }
        }
      }
    };
    void load();
  }, [owner.sId, agentConfigurations]);

  const handleSave = async () => {
    if (!selectedAgent || !channelId.trim()) {
      sendNotification({
        type: "error",
        title: "Validation Error",
        description: "Please select an agent and enter a channel ID.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const r = await fetch(`/api/w/${owner.sId}/labs/slack_channel_agent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: channelId.trim(),
          agentConfigurationId: selectedAgent.sId,
          isEnabled: isEnabled,
        }),
      });

      if (r.ok) {
        const j = await r.json();
        setSavedConfig(j.configuration);
        sendNotification({
          type: "success",
          title: "Configuration Saved",
          description:
            "Your Slack Channel Agent configuration has been updated.",
        });
      } else {
        const errorData = await r.json();
        sendNotification({
          type: "error",
          title: "Save Failed",
          description:
            errorData.error?.message ||
            `HTTP ${r.status}: Could not save configuration.`,
        });
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Save Failed",
        description:
          error instanceof Error
            ? error.message
            : "Could not save your configuration. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectSlack = async () => {
    try {
      const cRes = await setupOAuthConnection({
        dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
        owner,
        provider: "slack",
        useCase: "labs_slack_channel_agent_bot",
        extraConfig: {},
      });

      if (cRes.isErr()) {
        sendNotification({
          type: "error",
          title: "Connection Failed",
          description: cRes.error.message,
        });
        return;
      }

      const connectResponse = await fetch(
        `/api/w/${owner.sId}/labs/slack_channel_agent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId: cRes.value.connection_id,
          }),
        }
      );

      if (!connectResponse.ok) {
        const errorData = await connectResponse.json();
        sendNotification({
          type: "error",
          title: "Connection Failed",
          description:
            errorData.error?.message ||
            `HTTP ${connectResponse.status}: Could not connect to Slack.`,
        });
        return;
      }

      const r = await fetch(`/api/w/${owner.sId}/labs/slack_channel_agent`);
      if (r.ok) {
        const j = await r.json();
        setSavedConfig(j.configuration);
        sendNotification({
          type: "success",
          title: "Slack Connected",
          description: "Your Slack workspace has been connected successfully.",
        });
      } else {
        sendNotification({
          type: "error",
          title: "Connection Failed",
          description: "Could not retrieve configuration after connecting.",
        });
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Connection Failed",
        description:
          error instanceof Error
            ? error.message
            : "Could not connect to Slack. Please try again.",
      });
    }
  };

  const handleAgentSelect = (agent: LightAgentConfigurationType) => {
    setSelectedAgent(agent);
  };

  const crumbs = [
    { label: "Exploratory features", href: `/w/${owner.sId}/labs` },
    {
      label: "Slack Channel Agent",
      href: `/w/${owner.sId}/labs/slack_channel_agent`,
    },
  ];

  return (
    <ConversationsNavigationProvider>
      <AppCenteredLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Slack Channel Agent"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <Breadcrumbs items={crumbs} />
        <Page>
          <Page.Header
            title="Slack Channel Agent"
            icon={TestTubeIcon}
            description="Automatically run an agent for every new top-level message in a selected Slack channel, and stream the answer back with full context."
          />
          <Page.Vertical align="stretch" gap="md">
            <div className="text-element-700 text-sm">
              <p className="mb-3">
                To add reactions, agents should return JSON with the following
                structure. The reaction will be added to the original user
                message, and only the message text will be displayed in the
                thread.
              </p>
              <CollapsibleComponent
                rootProps={{ defaultOpen: false }}
                triggerChildren={
                  <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                    Response Format
                  </span>
                }
                contentChildren={
                  <div className="py-2">
                    <CodeBlock className="language-json" wrapLongLines={true}>
                      {`{
  "message": "Your response text",
  "reaction": {
    "add": true,
    "reaction": "thumbsup"
  }
}`}
                    </CodeBlock>
                  </div>
                }
              />
            </div>
          </Page.Vertical>
          <Page.Vertical align="stretch" gap="xl">
            <Page.Vertical align="stretch" gap="md">
              <Page.SectionHeader title="Connect Slack" />
              <SlackConnection
                isConnected={!!savedConfig?.connectionId}
                onConnect={handleConnectSlack}
              />
            </Page.Vertical>

            {savedConfig?.connectionId && (
              <SlackConfiguration
                owner={owner}
                agents={activeAgents}
                selectedAgent={selectedAgent}
                channelId={channelId}
                isEnabled={isEnabled}
                onAgentSelect={handleAgentSelect}
                onChannelIdChange={setChannelId}
                onToggleEnabled={setIsEnabled}
                onSave={handleSave}
                isSaving={isSaving}
              />
            )}
          </Page.Vertical>
        </Page>
      </AppCenteredLayout>
    </ConversationsNavigationProvider>
  );
}

LabsSlackChannelAgentIndex.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
