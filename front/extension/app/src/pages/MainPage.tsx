import { GenerationContextProvider } from "@app/shared/context/GenerationContextProvider";
import { FixedAssistantInputBar } from "@app/shared/input_bar/InputBar";
import {
  Button,
  ExternalLinkIcon,
  LogoHorizontalColorLogo,
  MarkPenIcon,
  Page,
  TranslateIcon,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { Link } from "react-router-dom";

export const MainPage = () => {
  const ws: WorkspaceType = {
    id: 1,
    sId: "test",
    name: "test",
    role: "user",
    segmentation: null,
    whiteListedProviders: null,
    defaultEmbeddingProvider: null,
    flags: [],
  };

  return (
    <div className="flex flex-col p-4 gap-2">
      <div className="flex gap-2 align-center">
        <LogoHorizontalColorLogo className="h-4 w-16" />
        <a href="https://dust.tt" target="_blank">
          <ExternalLinkIcon color="#64748B" />
        </a>
      </div>
      <div className="flex flex-grow gap-2 p-1">
        <Button
          className="flex-grow"
          icon={MarkPenIcon}
          variant="secondary"
          label="Summarize"
        ></Button>
        <Button
          className="flex-grow"
          icon={TranslateIcon}
          variant="secondary"
          label="Translate"
        ></Button>
      </div>
      <Page.SectionHeader title="Conversation" />
      <Link to="/conversation">Conversations</Link>
      <GenerationContextProvider >
      <FixedAssistantInputBar
        owner={ws}
        baseAgentConfigurations={[]}
        onSubmit={() => {}}
        stickyMentions={[]}
        conversationId={null}
      />
      </GenerationContextProvider>
      <Page.SectionHeader title="Favorites" />
    </div>
  );
};
