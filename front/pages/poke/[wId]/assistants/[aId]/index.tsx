import {
  Button,
  ContextItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Page,
  TextArea,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { AgentOverviewTable } from "@app/components/poke/assistants/AgentOverviewTable";
import { ConversationAgentDataTable } from "@app/components/poke/conversations/agent_table";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import PokeLayout from "@app/components/poke/PokeLayout";
import { TriggerDataTable } from "@app/components/poke/triggers/table";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { listsAgentConfigurationVersions } from "@app/lib/api/assistant/configuration/agent";
import { getAuthors, getEditors } from "@app/lib/api/assistant/editors";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { decodeSqids } from "@app/lib/utils";
import type {
  AgentConfigurationType,
  SpaceType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  agentConfigurations: AgentConfigurationType[];
  authors: UserType[];
  lastVersionEditors: UserType[];
  spaces: SpaceType[];
  workspace: WorkspaceType;
}>(async (context, auth) => {
  const aId = context.params?.aId;
  if (!aId || typeof aId !== "string") {
    return {
      notFound: true,
    };
  }

  const agentConfigurations = await listsAgentConfigurationVersions(auth, {
    agentId: aId,
    variant: "full",
  });

  const lastVersionEditors = await getEditors(auth, agentConfigurations[0]);
  const [latestAgentConfiguration] = agentConfigurations;
  const uniqueGroupIds = Array.from(
    new Set(latestAgentConfiguration.requestedGroupIds.flat())
  );
  const groupRes = await GroupResource.fetchByIds(auth, uniqueGroupIds);
  if (groupRes.isErr()) {
    throw new Error(`Failed to fetch groups: ${groupRes.error.message}`);
  }

  const spaces = await SpaceResource.listForGroups(auth, groupRes.value);

  return {
    props: {
      agentConfigurations,
      authors: await getAuthors(agentConfigurations),
      lastVersionEditors,
      spaces: spaces.map((s) => s.toJSON()),
      workspace: auth.getNonNullableWorkspace(),
    },
  };
});

const AssistantDetailsPage = ({
  agentConfigurations,
  authors,
  lastVersionEditors,
  spaces,
  workspace,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { isDark } = useTheme();
  return (
    <div>
      <div className="flex flex-row items-center gap-4">
        <h3 className="text-xl font-bold">
          Agent from workspace{" "}
          <a href={`/poke/${workspace.sId}`} className="text-highlight-500">
            {workspace.name}
          </a>
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              icon={UserGroupIcon}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.focus();
              }}
              label="Editors"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
            }}
          >
            {lastVersionEditors.length === 0 && (
              <DropdownMenuItem label="No editors found!" />
            )}
            {lastVersionEditors.map((editor) => (
              <DropdownMenuItem
                key={editor.id}
                label={`${editor.fullName} (${editor.email})`}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex flex-row items-stretch space-x-3">
        <AgentOverviewTable
          agentConfiguration={agentConfigurations[0]}
          authors={authors}
          spaces={spaces}
        />
        <div className="flex flex-grow flex-col">
          <PluginList
            pluginResourceTarget={{
              resourceId: agentConfigurations[0].sId,
              resourceType: "agents",
              workspace: workspace,
            }}
          />
        </div>
      </div>

      <div className="mt-4">
        <ConversationAgentDataTable
          owner={workspace}
          agentId={agentConfigurations[0].sId}
        />
      </div>

      <div className="mt-4">
        <TriggerDataTable
          owner={workspace}
          agentId={agentConfigurations[0].sId}
        />
      </div>

      <Page.Vertical align="stretch">
        <ContextItem.List>
          {agentConfigurations.map((a) => {
            const author = authors.find(
              (user) => user.id === a.versionAuthorId
            );
            return (
              <ContextItem
                key={a.version}
                title={`@${a.name} (${a.sId}) v${a.version}`}
                visual={<></>}
              >
                <ContextItem.Description>
                  <div className="flex flex-col gap-2">
                    <div className="ml-4 pt-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
                      <div>Created at: {`${a.versionCreatedAt}`}</div>
                      <div>Scope: {a.scope}</div>
                      <div>Description: {a.description}</div>
                    </div>
                    <div className="ml-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
                      <div className="font-bold">Author:</div>
                      <div>ID: {a.versionAuthorId}</div>
                      {author && (
                        <div>
                          Name: {author.fullName}
                          <br />
                          Email: {author.email}
                        </div>
                      )}
                    </div>
                    <div className="ml-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
                      <div className="font-bold">Model:</div>
                      <div>
                        {SUPPORTED_MODEL_CONFIGS.find(
                          (m) => m.modelId === a.model.modelId
                        )?.displayName ?? `Unknown Model (${a.model.modelId})`}
                      </div>
                      <JsonViewer
                        theme={isDark ? "dark" : "light"}
                        value={decodeSqids(a.model)}
                        rootName={false}
                        defaultInspectDepth={0}
                      />
                    </div>

                    <div className="ml-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
                      <div className="font-bold">Actions:</div>
                      <div>maxStepPerRun: {a.maxStepsPerRun}</div>
                      {a.actions.map((action, index) => (
                        <div key={index}>
                          <div>
                            {action.type}
                            {action.type === "mcp_server_configuration" &&
                              " (" + action.name + ")"}
                          </div>
                          <JsonViewer
                            theme={isDark ? "dark" : "light"}
                            value={decodeSqids(action)}
                            rootName={false}
                            defaultInspectDepth={0}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="ml-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
                      <div className="font-bold">Instructions:</div>
                      <TextArea
                        placeholder=""
                        value={a.instructions ?? ""}
                        onChange={() => {
                          // noop
                        }}
                      />
                    </div>
                  </div>
                </ContextItem.Description>
              </ContextItem>
            );
          })}
        </ContextItem.List>
      </Page.Vertical>
    </div>
  );
};

AssistantDetailsPage.getLayout = (
  page: ReactElement,
  { workspace }: { workspace: WorkspaceType }
) => {
  return (
    <PokeLayout title={`${workspace.name} - Assistants`}>{page}</PokeLayout>
  );
};

export default AssistantDetailsPage;
