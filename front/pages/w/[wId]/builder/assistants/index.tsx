import {
  Avatar,
  Button,
  PageHeader,
  PencilSquareIcon,
  PlusIcon,
  RobotIcon,
  SectionHeader,
  SliderToggle,
} from "@dust-tt/sparkle";
import { PropsOf } from "@headlessui/react/dist/types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { classNames } from "@app/lib/utils";
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
      <div>
        <SectionHeader
          title="Dust Assistants"
          description="AI assistants with specific capabilities that you can call using the “@” handle(for instance @myAssistant, @spelling, @translate)."
        />
        <ul className="mt-8 space-y-4">
          {dustAgents.map((agent) => (
            <ListItem
              key={agent.sId}
              imageUrl={agent.pictureUrl}
              name={`@${agent.name}`}
              description={agent.description}
              action={{
                type: "slider-toggle",
                props: {
                  selected: agent.status === "active",
                  onClick: () => {
                    alert(":)");
                  },
                },
              }}
            />
          ))}
        </ul>
      </div>
      <div>
        <SectionHeader
          title="Custom Assistants"
          description="Build your own Assistant, use specific instructions and specific data sources to get better answers."
          action={{
            label: "Create a new Assistant",
            variant: "secondary",
            icon: PlusIcon,
            size: "sm",
            onClick: () => {
              void router.push(`/w/${owner.sId}/builder/assistants/new`);
            },
          }}
        />
        <ul className="mt-8 space-y-4">
          {workspaceAgents.map((agent) => (
            <ListItem
              key={agent.sId}
              imageUrl={agent.pictureUrl}
              name={`@${agent.name}`}
              description={agent.description}
              action={{
                type: "button",
                props: {
                  variant: "secondary",
                  icon: PencilSquareIcon,
                  label: "Edit",
                  onClick: () => {
                    void router.push(
                      `/w/${owner.sId}/builder/assistants/${agent.sId}`
                    );
                  },
                },
              }}
            />
          ))}
        </ul>
      </div>
    </AppLayout>
  );
}

function ListItem({
  imageUrl,
  name,
  description,
  action,
}: {
  imageUrl: string;
  name: string;
  description: string;
  action?:
    | {
        type: "button";
        props: PropsOf<typeof Button>;
      }
    | {
        type: "slider-toggle";
        props: PropsOf<typeof SliderToggle>;
      };
}) {
  return (
    <div className="flex items-start">
      <div className="min-w-5 flex">
        <div className="mr-2">
          <Avatar visual={<img src={imageUrl} />} size={"sm"} />
        </div>
        <div className="flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center">
            <span className={classNames("text-sm font-bold text-element-900")}>
              {name}
            </span>
          </div>
          <div className="mt-2 text-sm text-element-700">{description}</div>
        </div>
      </div>
      <div className="flex flex-1" />
      {action && action.type === "button" && (
        <div>
          <Button {...action.props} />
        </div>
      )}
      {action && action.type === "slider-toggle" && (
        <div>
          <SliderToggle {...action.props} />
        </div>
      )}
    </div>
  );
}
