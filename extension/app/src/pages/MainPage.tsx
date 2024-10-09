import {
  Button,
  ExternalLinkIcon,
  LogoHorizontalColorLogo,
  MarkPenIcon,
  Page,
  TranslateIcon,
} from "@dust-tt/sparkle";
import { Link } from "react-router-dom";

export const MainPage = () => {
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

      <Page.SectionHeader title="Favorites" />
    </div>
  );
};
