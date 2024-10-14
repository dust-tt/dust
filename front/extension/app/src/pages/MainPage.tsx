import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import {
  Button,
  ExternalLinkIcon,
  LoginIcon,
  LogoHorizontalColorLogo,
  LogoutIcon,
  Page,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { useAuth } from "@extension/hooks/useAuth";

export const MainPage = () => {
  const { token, isLoading, handleLogin, handleLogout } = useAuth();

  const owner: WorkspaceType = {
    id: 1,
    sId: "IQw2NP0Anb",
    name: "test",
    role: "user",
    segmentation: null,
    whiteListedProviders: null,
    defaultEmbeddingProvider: null,
    flags: [],
  };

  return (
    <div className="flex h-screen flex-col gap-2 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 pb-10">
          <LogoHorizontalColorLogo className="h-4 w-16" />
          <a href="https://dust.tt" target="_blank">
            <ExternalLinkIcon color="#64748B" />
          </a>
        </div>

        {token && (
          <Button
            icon={LogoutIcon}
            variant="tertiary"
            label="Sign out"
            onClick={handleLogout}
          />
        )}
      </div>

      {isLoading && (
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      )}

      {!isLoading && !token && (
        <div className="flex h-full w-full items-center justify-center">
          <Button
            icon={LoginIcon}
            variant="primary"
            label="Sign in"
            onClick={handleLogin}
          />
        </div>
      )}

      {token && (
        <div className="h-full w-full">
          <Page.SectionHeader title="Conversation" />
          <GenerationContextProvider>
            <FixedAssistantInputBar
              owner={owner}
              onSubmit={() => {}}
              stickyMentions={[]}
              actions={["attachment", "assistants-list"]}
              conversationId={null}
            />
          </GenerationContextProvider>
          {/* <Link to="/conversation">Conversations</Link> */}
          <TextArea />
          <Button
            variant="primary"
            label="Send"
            className="mt-4"
            onClick={() => alert("Sorry, not implemented yet!")}
          />
        </div>
      )}
    </div>
  );
};
