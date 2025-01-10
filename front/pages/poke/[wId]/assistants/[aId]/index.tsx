import { ContextItem, Page, TextArea } from "@dust-tt/sparkle";
import type { AgentConfigurationType } from "@dust-tt/types";
import { SUPPORTED_MODEL_CONFIGS } from "@dust-tt/types";
import { JsonViewer } from "@textea/json-viewer";
import type { InferGetServerSidePropsType } from "next";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<{
  agentConfigurations: AgentConfigurationType[];
}>(async (context, auth) => {
  const aId = context.params?.aId;
  if (!aId || typeof aId !== "string") {
    return {
      notFound: true,
    };
  }

  const agentConfigurations = await getAgentConfigurations({
    auth,
    agentsGetView: { agentIds: [aId], allVersions: true },
    variant: "full",
  });

  return {
    props: {
      agentConfigurations,
    },
  };
});

const DataSourcePage = ({
  agentConfigurations,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="mx-auto max-w-4xl pt-8">
        <Page.Vertical align="stretch">
          <ContextItem.List>
            {agentConfigurations.map((a) => (
              <ContextItem
                key={a.version}
                title={`@${a.name} (${a.sId}) v${a.version}`}
                visual={<></>}
              >
                <ContextItem.Description>
                  <div className="flex flex-col gap-2">
                    <div className="ml-4 pt-2 text-sm text-element-700">
                      <div className="font-bold">Created At:</div>
                      <div>{`${a.versionCreatedAt}`}</div>
                    </div>
                    <div className="ml-4 pt-2 text-sm text-element-700">
                      <div className="font-bold">Scope:</div>
                      <div>{a.scope}</div>
                    </div>
                    <div className="ml-4 pt-2 text-sm text-element-700">
                      <div className="font-bold">versionAuthorId:</div>
                      <div>{a.versionAuthorId}</div>
                    </div>
                    <div className="ml-4 pt-2 text-sm text-element-700">
                      <div className="font-bold">Description:</div>
                      <div>{a.description}</div>
                    </div>
                    <div className="ml-4 text-sm text-element-700">
                      <div className="font-bold">Instructions:</div>
                      <TextArea placeholder="" value={a.instructions ?? ""} />
                    </div>
                    <div className="ml-4 text-sm text-element-700">
                      <div className="font-bold">
                        Model:{" "}
                        {SUPPORTED_MODEL_CONFIGS.find(
                          (m) => m.modelId === a.model.modelId
                        )?.displayName ?? `Unknown Model (${a.model.modelId})`}
                      </div>
                      <JsonViewer
                        value={a.model}
                        rootName={false}
                        defaultInspectDepth={0}
                      />
                    </div>
                    <div className="ml-4 text-sm text-element-700">
                      {a.actions.map((action, index) => (
                        <div key={index}>
                          <div className="font-bold">
                            Action {index + 1}: {action.type}
                          </div>
                          <JsonViewer
                            value={action}
                            rootName={false}
                            defaultInspectDepth={0}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </ContextItem.Description>
              </ContextItem>
            ))}
          </ContextItem.List>
        </Page.Vertical>
      </div>
    </div>
  );
};

export default DataSourcePage;
