import {
  Avatar,
  Button,
  ContextItem,
  PageHeader,
  PencilSquareIcon,
  PlusIcon,
  RobotIcon,
  SectionHeader,
  SliderToggle,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { AgentConfigurationType } from "@app/types/assistant/agent";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  gaTrackingId: string;
  workspaceAgents: AgentConfigurationType[];
  dustAgents: AgentConfigurationType[];
}> = async (context) => {
  const session = await getSession(context.req, context.res);

  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();

  const allAgents = await getAgentConfigurations(auth);
  const workspaceAgents = allAgents.filter((a) => a.scope === "workspace");
  const dustAgents = allAgents.filter((a) => a.scope === "global");

  if (
    !owner ||
    !user ||
    !auth.isBuilder() ||
    !isDevelopmentOrDustWorkspace(owner)
  ) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
      workspaceAgents,
      dustAgents,
    },
  };
};

export default function AssistantsBuilder({
  user,
  owner,
  gaTrackingId,
  dustAgents,
  workspaceAgents,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "assistants" })}
    >
      <PageHeader
        title="Assistants Builder"
        icon={RobotIcon}
        description="Build an assistant."
      />
      <div className="flex flex-col gap-4 pb-4">
        <div>
          <SectionHeader
            title="Dust Assistants"
            description="AI assistants with specific capabilities that you can call using the “@” handle(for instance @myAssistant, @spelling, @translate)."
          />
          <ContextItem.List className="mt-8  text-element-900">
            {dustAgents.map((agent) => (
              <ContextItem
                key={agent.sId}
                title={`@${agent.name}`}
                visual={
                  <Avatar visual={<img src={agent.pictureUrl} />} size={"sm"} />
                }
                action={
                  <SliderToggle
                    size="sm"
                    onClick={() => {
                      alert(":)");
                    }}
                    selected={agent.status === "active"}
                  />
                }
              >
                <ContextItem.Description>
                  <div className="text-element-700">{agent.description}</div>
                </ContextItem.Description>
              </ContextItem>
            ))}
          </ContextItem.List>
        </div>
        <div>
          <SectionHeader
            title="Custom Assistants"
            description="Build your own Assistant, use specific instructions and specific data sources to get better answers."
            action={{
              label: "Create a new Assistant",
              variant: "primary",
              icon: PlusIcon,
              size: "sm",
              onClick: () => {
                void router.push(`/w/${owner.sId}/builder/assistants/new`);
              },
            }}
          />
          <ContextItem.List className="mt-8  text-element-900">
            {workspaceAgents.map((agent) => (
              <ContextItem
                key={agent.sId}
                title={`@${agent.name}`}
                visual={
                  <Avatar visual={<img src={agent.pictureUrl} />} size={"sm"} />
                }
                action={
                  <Button
                    variant="secondary"
                    icon={PencilSquareIcon}
                    label="Edit"
                    size="sm"
                    onClick={() => {
                      void router.push(
                        `/w/${owner.sId}/builder/assistants/${agent.sId}`
                      );
                    }}
                  />
                }
              >
                <ContextItem.Description>
                  <div className="text-element-700">{agent.description}</div>
                </ContextItem.Description>
              </ContextItem>
            ))}
          </ContextItem.List>
        </div>
      </div>
    </AppLayout>
  );
}
