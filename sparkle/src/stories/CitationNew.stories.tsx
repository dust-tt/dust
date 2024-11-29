import type { Meta } from "@storybook/react";
import React from "react";

import {
  Button,
  CitationNew,
  CitationNewClose,
  CitationNewDescription,
  CitationNewGrid,
  CitationNewIcons,
  CitationNewImage,
  CitationNewIndex,
  CitationNewTitle,
  DocumentIcon,
  ExternalLinkIcon,
  GlobeAltIcon,
  Icon,
  ImageIcon,
  NotionLogo,
  Popover,
  SlackLogo,
  TableIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Components/CitationNew",
  component: CitationNew,
} satisfies Meta<typeof CitationNew>;

export default meta;

export const CitationsExample = () => (
  <div className="s-flex s-flex-col s-gap-8">
    Example of attachement
    <div className="s-flex s-gap-2">
      <CitationNew
        onClick={() => alert("Card clicked")}
        className="s-w-48"
        isPulsing={true}
      >
        <CitationNewIcons>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Slack thread</CitationNewTitle>
        <CitationNewDescription>
          @ed at 16:32 This is the latest ve
        </CitationNewDescription>
      </CitationNew>
      <CitationNew onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationNewIcons>
          <Icon visual={TableIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>extract_financa.csv</CitationNewTitle>
      </CitationNew>
      <CitationNew onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationNewIcons>
          <Icon visual={GlobeAltIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Linkedin, Edouard Wautier</CitationNewTitle>
      </CitationNew>

      <CitationNew onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationNewImage imgSrc="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg" />
        <CitationNewIcons>
          <Icon visual={ImageIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>screenshot.png</CitationNewTitle>
      </CitationNew>

      <CitationNew className="s-w-48" isBlinking={true} isLoading={true}>
        <CitationNewIcons>
          <Icon visual={ImageIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>screenshot.png</CitationNewTitle>
      </CitationNew>
    </div>
    Example of dissmissable attachements
    <div className="s-flex s-gap-8">
      <CitationNew onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationNewIcons>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Slack thread</CitationNewTitle>
        <CitationNewClose onClick={() => alert("Close clicked")} />
        <CitationNewDescription>
          @ed at 16:32 This is the latest ve
        </CitationNewDescription>
      </CitationNew>
      <CitationNew onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationNewIcons>
          <Icon visual={TableIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewClose onClick={() => alert("Close clicked")} />
        <CitationNewTitle>extract_financa.csv</CitationNewTitle>
      </CitationNew>
      <CitationNew onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationNewIcons>
          <Icon visual={GlobeAltIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewClose onClick={() => alert("Close clicked")} />
        <CitationNewTitle>Linkedin, Edouard Wautier</CitationNewTitle>
      </CitationNew>

      <CitationNew onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationNewImage imgSrc="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg" />
        <CitationNewIcons>
          <Icon visual={ImageIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewClose onClick={() => alert("Close clicked")} />
        <CitationNewTitle>screenshot.png</CitationNewTitle>
      </CitationNew>
    </div>
    Example of citations in markdown
    <div>
      <Popover
        trigger={<CitationNewIndex>1</CitationNewIndex>}
        content={
          <>
            <CitationNewIcons>
              <CitationNewIndex>1</CitationNewIndex>
              <Icon visual={SlackLogo} size="sm" />
            </CitationNewIcons>
            <CitationNewTitle>Hello</CitationNewTitle>
            <Button
              variant={"ghost"}
              icon={ExternalLinkIcon}
              className="s-absolute s-right-2 s-top-2"
            />
          </>
        }
      />
    </div>
    Example of dynamic grid
    <CitationNewGrid>
      <CitationNew onClick={() => alert("Card clicked")}>
        <CitationNewIcons>
          <CitationNewIndex>1</CitationNewIndex>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
      </CitationNew>
      <CitationNew onClick={() => alert("Close action clicked")}>
        <CitationNewIcons>
          <CitationNewIndex>2</CitationNewIndex>
          <Icon visual={NotionLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
      </CitationNew>
      <CitationNew onClick={() => alert("Close action clicked")}>
        <CitationNewIcons>
          <CitationNewIndex>3</CitationNewIndex>
          <Icon visual={DocumentIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
      </CitationNew>
      <CitationNew onClick={() => alert("Close action clicked")}>
        <CitationNewIcons>
          <CitationNewIndex>4</CitationNewIndex>
          <Icon visual={GlobeAltIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
      </CitationNew>
    </CitationNewGrid>
  </div>
);
