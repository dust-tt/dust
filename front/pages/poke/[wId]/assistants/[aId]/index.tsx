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

import PokeLayout from "@app/components/poke/PokeLayout";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { getAuthors, getEditors } from "@app/lib/api/assistant/editors";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type {
  AgentConfigurationType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  agentConfigurations: AgentConfigurationType[];
  authors: UserType[];
  lastVersionEditors: UserType[];
  workspace: WorkspaceType;
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

  const lastVersionEditors = await getEditors(auth, agentConfigurations[0]);

  return {
    props: {
      agentConfigurations,
      lastVersionEditors,
      authors: await getAuthors(agentConfigurations),
      workspace: auth.getNonNullableWorkspace(),
    },
  };
});

const AssistantDetailsPage = ({
  agentConfigurations,
  authors,
  lastVersionEditors,
  workspace,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { isDark } = useTheme();
  return (
    <div>
      <div className="flex">
        <h3 className="flex-grow text-xl font-bold">
          Assistant of workspace:{" "}
          <a href={`/poke/${workspace.sId}`} className="text-highlight-500">
            {workspace.name}
          </a>
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              icon={UserGroupIcon}
              onClick={(e: any) => {
                e.currentTarget.focus();
              }}
              label={`Editors`}
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
                    <div className="ml-4 pt-2 text-sm text-muted-foreground">
                      <div className="font-bold">Created At:</div>
                      <div>{`${a.versionCreatedAt}`}</div>
                    </div>
                    <div className="ml-4 pt-2 text-sm text-muted-foreground">
                      <div className="font-bold">Scope:</div>
                      <div>{a.scope}</div>
                    </div>
                    <div className="ml-4 pt-2 text-sm text-muted-foreground">
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
                    <div className="ml-4 pt-2 text-sm text-muted-foreground">
                      <div className="font-bold">Description:</div>
                      <div>{a.description}</div>
                    </div>
                    <div className="ml-4 text-sm text-muted-foreground">
                      <div className="font-bold">Instructions:</div>
                      <TextArea
                        placeholder=""
                        value={a.instructions ?? ""}
                        onChange={() => {
                          // noop
                        }}
                      />
                    </div>
                    <div className="ml-4 text-sm text-muted-foreground">
                      <div className="font-bold">
                        Model:{" "}
                        {SUPPORTED_MODEL_CONFIGS.find(
                          (m) => m.modelId === a.model.modelId
                        )?.displayName ?? `Unknown Model (${a.model.modelId})`}
                      </div>
                      <JsonViewer
                        theme={isDark ? "dark" : "light"}
                        value={a.model}
                        rootName={false}
                        defaultInspectDepth={0}
                      />
                    </div>
                    <div className="ml-4 text-sm text-muted-foreground">
                      {a.actions.map((action, index) => (
                        <div key={index}>
                          <div className="font-bold">
                            Action {index + 1}: {action.type} (
                            {action.type === "retrieval_configuration" &&
                              (action.query === "auto" ? "search" : "include")}
                            )
                          </div>
                          <JsonViewer
                            theme={isDark ? "dark" : "light"}
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
