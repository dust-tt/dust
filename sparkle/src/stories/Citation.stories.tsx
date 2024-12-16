import type { Meta } from "@storybook/react";
import React from "react";

import {
  Button,
  Citation,
  CitationClose,
  CitationDescription,
  CitationGrid,
  CitationIcons,
  CitationImage,
  CitationIndex,
  CitationTitle,
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
  title: "Components/Citation",
  component: Citation,
} satisfies Meta<typeof Citation>;

export default meta;

export const CitationsExample = () => (
  <div className="s-flex s-flex-col s-gap-8">
    Example of attachement
    <div className="s-flex s-gap-2">
      <Citation onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationIcons>
          <Icon visual={SlackLogo} size="sm" />
        </CitationIcons>
        <CitationTitle>Slack thread</CitationTitle>
        <CitationDescription>
          @ed at 16:32 This is the latest ve
        </CitationDescription>
      </Citation>
      <Citation onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationIcons>
          <Icon visual={TableIcon} size="sm" />
        </CitationIcons>
        <CitationTitle>extract_financa.csv</CitationTitle>
      </Citation>
      <Citation onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationIcons>
          <Icon visual={GlobeAltIcon} size="sm" />
        </CitationIcons>
        <CitationTitle>Linkedin, Edouard Wautier</CitationTitle>
      </Citation>

      <Citation onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationImage imgSrc="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg" />
        <CitationIcons>
          <Icon visual={ImageIcon} size="sm" />
        </CitationIcons>
        <CitationTitle>screenshot.png</CitationTitle>
      </Citation>

      <Citation className="s-w-48" isLoading={true}>
        <CitationIcons>
          <Icon visual={ImageIcon} size="sm" />
        </CitationIcons>
        <CitationTitle>screenshot.png</CitationTitle>
      </Citation>
    </div>
    Example of dissmissable attachements
    <div className="s-flex s-gap-8">
      <Citation onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationIcons>
          <Icon visual={SlackLogo} size="sm" />
        </CitationIcons>
        <CitationTitle>Slack thread</CitationTitle>
        <CitationClose onClick={() => alert("Close clicked")} />
        <CitationDescription>
          @ed at 16:32 This is the latest ve
        </CitationDescription>
      </Citation>
      <Citation onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationIcons>
          <Icon visual={TableIcon} size="sm" />
        </CitationIcons>
        <CitationClose onClick={() => alert("Close clicked")} />
        <CitationTitle>extract_financa.csv</CitationTitle>
      </Citation>
      <Citation onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationIcons>
          <Icon visual={GlobeAltIcon} size="sm" />
        </CitationIcons>
        <CitationClose onClick={() => alert("Close clicked")} />
        <CitationTitle>Linkedin, Edouard Wautier</CitationTitle>
      </Citation>

      <Citation onClick={() => alert("Card clicked")} className="s-w-48">
        <CitationImage imgSrc="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg" />
        <CitationIcons>
          <Icon visual={ImageIcon} size="sm" />
        </CitationIcons>
        <CitationClose onClick={() => alert("Close clicked")} />
        <CitationTitle>screenshot.png</CitationTitle>
      </Citation>
    </div>
    Example of citations in markdown
    <div>
      <Popover
        trigger={<CitationIndex>1</CitationIndex>}
        content={
          <>
            <CitationIcons>
              <CitationIndex>1</CitationIndex>
              <Icon visual={SlackLogo} size="sm" />
            </CitationIcons>
            <CitationTitle>Hello</CitationTitle>
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
    <CitationGrid>
      <Citation onClick={() => alert("Card clicked")}>
        <CitationIcons>
          <CitationIndex>1</CitationIndex>
          <Icon visual={SlackLogo} size="sm" />
        </CitationIcons>
        <CitationTitle>Hello</CitationTitle>
      </Citation>
      <Citation onClick={() => alert("Close action clicked")}>
        <CitationIcons>
          <CitationIndex>2</CitationIndex>
          <Icon visual={NotionLogo} size="sm" />
        </CitationIcons>
        <CitationTitle>Hello</CitationTitle>
      </Citation>
      <Citation onClick={() => alert("Close action clicked")}>
        <CitationIcons>
          <CitationIndex>3</CitationIndex>
          <Icon visual={DocumentIcon} size="sm" />
        </CitationIcons>
        <CitationTitle>Hello</CitationTitle>
      </Citation>
      <Citation onClick={() => alert("Close action clicked")}>
        <CitationIcons>
          <CitationIndex>4</CitationIndex>
          <Icon visual={GlobeAltIcon} size="sm" />
        </CitationIcons>
        <CitationTitle>Hello</CitationTitle>
      </Citation>
    </CitationGrid>
  </div>
);
