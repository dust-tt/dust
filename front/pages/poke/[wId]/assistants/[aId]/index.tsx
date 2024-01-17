import { Avatar, ContextItem, Page } from "@dust-tt/sparkle";
import type { AgentConfigurationType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import {
  isDustAppRunConfiguration,
  isRetrievalConfiguration,
} from "@dust-tt/types";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession } from "@app/lib/auth";

export const getServerSideProps: GetServerSideProps<{
  owner: WorkspaceType;
  agentConfigurations: AgentConfigurationType[];
}> = async (context) => {
  const wId = context.params?.wId;
  if (!wId || typeof wId !== "string") {
    return {
      notFound: true,
    };
  }

  const aId = context.params?.aId;
  if (!aId || typeof aId !== "string") {
    return {
      notFound: true,
    };
  }

  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const user = auth.user();
  const owner = auth.workspace();

  if (!user || !owner) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }

  if (!auth.isDustSuperUser()) {
    return {
      notFound: true,
    };
  }

  const agentConfigurations = await getAgentConfigurations({
    auth,
    agentsGetView: { agentId: aId, allVersions: true },
    variant: "full",
  });

  return {
    props: {
      owner,
      agentConfigurations,
    },
  };
};

const DataSourcePage = ({
  owner,
  agentConfigurations,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  void owner;
  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="mx-auto max-w-4xl">
        <div className="px-8 py-8"></div>
        <Page.Vertical align="stretch">
          <Page.SectionHeader title={`${agentConfigurations[0].name}`} />

          <div className="mt-4 flex flex-row">
            <div className="flex flex-1">
              <div className="flex flex-col">
                <div className="flex flex-row"></div>
              </div>
            </div>
          </div>

          <div className="py-8">
            <ContextItem.List>
              {agentConfigurations.map((a) => (
                <ContextItem
                  key={a.version}
                  title={`@${a.name} (${a.sId}) V${a.version}`}
                  visual={
                    <ContextItem.Visual
                      visual={() =>
                        Avatar({ visual: a.pictureUrl, size: "xs" })
                      }
                    />
                  }
                >
                  <ContextItem.Description>
                    <div className="gap8 flex flex-col">
                      <div>Created at: {`${a.versionCreatedAt}`}</div>
                      <div className="pt-2 text-sm text-element-700">
                        {a.generation?.prompt}
                      </div>
                      <div className="pt-2 text-sm text-element-700">
                        model:{" "}
                        {`${JSON.stringify(a.generation?.model, null, 2)}`}
                      </div>
                      {a.action && isRetrievalConfiguration(a.action) && (
                        <div className="mb-2 flex-col text-sm text-gray-600">
                          <div className="font-bold">Data Sources:</div>
                          {JSON.stringify(a.action.dataSources, null, 2)}
                        </div>
                      )}
                      {a.action && isDustAppRunConfiguration(a.action) && (
                        <div className="mb-2 flex-col text-sm text-gray-600">
                          <div className="font-bold">Dust app:</div>
                          <div>
                            {a.action.appWorkspaceId}/{a.action.appId}
                          </div>
                        </div>
                      )}
                    </div>
                  </ContextItem.Description>
                </ContextItem>
              ))}
            </ContextItem.List>
          </div>
        </Page.Vertical>
      </div>
    </div>
  );
};

export default DataSourcePage;
