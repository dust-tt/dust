import {
  Button,
  ContextItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ExternalLinkIcon,
  IconButton,
  LinkWrapper,
  Page,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";

import { AgentOverviewTable } from "@app/components/poke/assistants/AgentOverviewTable";
import { ConversationAgentDataTable } from "@app/components/poke/conversation/agent_table";
import { DatasourceRetrievalTreemapPluginChart } from "@app/components/poke/plugins/components/DatasourceRetrievalTreemapPluginChart";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { TriggerDataTable } from "@app/components/poke/triggers/table";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { decodeSqids } from "@app/lib/utils";
import { usePokeAgentDetails } from "@app/poke/swr/agent_details";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types";

export function AssistantDetailsPage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - Assistants`);

  const aId = useRequiredPathParam("aId");
  const { isDark } = useTheme();

  const {
    data: agentDetails,
    isLoading,
    isError,
  } = usePokeAgentDetails({
    owner,
    aId,
    disabled: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !agentDetails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading agent details.</p>
      </div>
    );
  }

  const { agentConfigurations, authors, lastVersionEditors, spaces, skills } =
    agentDetails;

  return (
    <div>
      <div className="flex flex-row items-center gap-4">
        <h3 className="text-xl font-bold">
          Agent from workspace{" "}
          <LinkWrapper
            href={`/poke/${owner.sId}`}
            className="text-highlight-500"
          >
            {owner.name}
          </LinkWrapper>
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

      <Tabs defaultValue="overview" className="mt-4">
        <TabsList>
          <TabsTrigger value="overview" label="Overview" />
          <TabsTrigger value="insights" label="Insights" />
        </TabsList>

        <TabsContent value="overview">
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
                  workspace: owner,
                }}
              />
            </div>
          </div>

          <div className="mt-4">
            <ConversationAgentDataTable
              owner={owner}
              agentId={agentConfigurations[0].sId}
            />
          </div>

          <div className="mt-4">
            <TriggerDataTable
              owner={owner}
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
                            )?.displayName ??
                              `Unknown Model (${a.model.modelId})`}
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
                          <div className="font-bold">Skills:</div>
                          {skills.length === 0 ? (
                            <div>No skills</div>
                          ) : (
                            skills.map((skill) => (
                              <div key={skill.sId}>
                                <div className="flex items-center gap-1">
                                  {skill.name}
                                  <LinkWrapper
                                    href={`/poke/${owner.sId}/skills/${skill.sId}`}
                                    target="_blank"
                                  >
                                    <IconButton
                                      icon={ExternalLinkIcon}
                                      size="xs"
                                      variant="outline"
                                    />
                                  </LinkWrapper>
                                </div>
                                <JsonViewer
                                  theme={isDark ? "dark" : "light"}
                                  value={skill}
                                  rootName={false}
                                  defaultInspectDepth={0}
                                />
                              </div>
                            ))
                          )}
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
        </TabsContent>

        <TabsContent value="insights">
          <div className="mt-4">
            <DatasourceRetrievalTreemapPluginChart
              workspaceId={owner.sId}
              agentConfigurationId={agentConfigurations[0].sId}
              period={30}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
