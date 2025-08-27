import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { ViewTriggerTable } from "@app/components/poke/triggers/view";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
  WorkspaceType,
} from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

export const getServerSideProps = withSuperUserAuthRequirements<{
  trigger: TriggerType;
  agent: LightAgentConfigurationType;
  owner: LightWorkspaceType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { aId, triggerId } = context.params || {};
  if (typeof aId !== "string" || typeof triggerId !== "string") {
    return {
      notFound: true,
    };
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "full",
  });
  if (!agentConfiguration) {
    return {
      notFound: true,
    };
  }

  const trigger = await TriggerResource.fetchById(auth, triggerId);
  if (!trigger || trigger.agentConfigurationId !== agentConfiguration.sId) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      trigger: trigger.toJSON(),
      agent: agentConfiguration,
      owner,
    },
  };
});

export default function TriggerPage({
  trigger,
  agent,
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div className="flex flex-row gap-x-6">
      <ViewTriggerTable trigger={trigger} agent={agent} owner={owner} />
    </div>
  );
}

TriggerPage.getLayout = (
  page: ReactElement,
  {
    owner,
    agent,
    trigger,
  }: {
    owner: WorkspaceType;
    agent: LightAgentConfigurationType;
    trigger: TriggerType;
  }
) => {
  return (
    <PokeLayout title={`${owner.name} - ${agent.name} - ${trigger.name}`}>
      {page}
    </PokeLayout>
  );
};
