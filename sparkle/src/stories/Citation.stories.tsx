import type { Meta } from "@storybook/react";
import React from "react";

import {
  Button,
  Citation,
  CitationClose,
  CitationDescription,
  CitationGrid,
  CitationIcons,
  CitationIndex,
  CitationTitle,
  DocumentIcon,
  ExternalLinkIcon,
  FaviconIcon,
  GlobeAltIcon,
  Icon,
  ImageIcon,
  Tooltip,
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
    <CitationGrid>
      <Citation
        onClick={() => alert("Card clicked")}
        tooltip="@ed at 16:32 This is the latest ve"
      >
        <CitationIcons>
          <Icon visual={SlackLogo} size="sm" />
        </CitationIcons>
        <CitationTitle>Citation w/ tooltip</CitationTitle>
        <CitationDescription>
          @ed at 16:32 This is the latest ve
        </CitationDescription>
      </Citation>
    </CitationGrid>
    <CitationGrid>
      <Citation
        onClick={() => alert("Card clicked")}
        tooltip="@ed at 16:32 This is the latest ve"
      >
        <CitationIcons>
          <Icon visual={SlackLogo} size="sm" />
        </CitationIcons>
        <CitationTitle>Slack thread</CitationTitle>
        <CitationDescription>
          @ed at 16:32 This is the latest ve
        </CitationDescription>
      </Citation>
      <Citation onClick={() => alert("Card clicked")}>
        <CitationIcons>
          <Icon visual={TableIcon} size="sm" />
        </CitationIcons>
        <CitationTitle>extract_financa.csv</CitationTitle>
      </Citation>
      <Citation onClick={() => alert("Card clicked")}>
        <CitationIcons>
          <FaviconIcon websiteUrl="https://www.linkedin.com" size="sm" />
        </CitationIcons>
        <CitationTitle>Linkedin, Edouard Wautier</CitationTitle>
      </Citation>

      <Citation onClick={() => alert("Card clicked")}>
        <CitationIcons>
          <FaviconIcon websiteUrl="https://github.com" size="sm" />
        </CitationIcons>
        <CitationTitle>GitHub Repository</CitationTitle>
      </Citation>

      <Citation
        onClick={() => alert("Card clicked")}
        tooltip={
          <img
            src="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
            alt="screenshot.png"
          />
        }
      >
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
    </CitationGrid>
    Example of dissmissable attachements
    <CitationGrid>
      <Citation
        onClick={() => alert("Card clicked")}
        className="s-w-48"
        action={<CitationClose onClick={() => alert("Close clicked")} />}
      >
        <CitationIcons>
          <Icon visual={SlackLogo} size="sm" />
        </CitationIcons>
        <CitationTitle>Slack thread</CitationTitle>
        <CitationDescription>
          @ed at 16:32 This is the latest ve
        </CitationDescription>
      </Citation>
      <Citation
        onClick={() => alert("Card clicked")}
        className="s-w-48"
        action={<CitationClose onClick={() => alert("Close clicked")} />}
      >
        <CitationIcons>
          <Icon visual={TableIcon} size="sm" />
        </CitationIcons>
        <CitationTitle>extract_financa.csv</CitationTitle>
      </Citation>
      <Citation
        onClick={() => alert("Card clicked")}
        className="s-w-48"
        action={<CitationClose onClick={() => alert("Close clicked")} />}
      >
        <CitationIcons>
          <Icon visual={GlobeAltIcon} size="sm" />
        </CitationIcons>
        <CitationTitle>Linkedin, Edouard Wautier</CitationTitle>
      </Citation>

      <Tooltip
        trigger={
          <Citation
            onClick={() => alert("Card clicked")}
            className="s-w-48"
            action={<CitationClose onClick={() => alert("Close clicked")} />}
          >
            <CitationIcons>
              <Icon visual={ImageIcon} size="sm" />
            </CitationIcons>
            <CitationTitle>screenshot.png</CitationTitle>
          </Citation>
        }
        label={
          <div className="s-flex s-w-80 s-max-w-[80vw] s-flex-col s-gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
              alt="screenshot.png"
              className="s-mx-auto s-max-h-40 s-w-full s-rounded-md s-object-contain"
            />
          </div>
        }
      />
    </CitationGrid>
    Example of citations in markdown
    <div>
      <Popover
        trigger={<CitationIndex>1</CitationIndex>}
        content={
          <>
            <CitationIcons>
              <Icon visual={SlackLogo} size="sm" />
              <CitationIndex>1</CitationIndex>
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
          <Icon visual={SlackLogo} size="sm" />
          <CitationIndex>1</CitationIndex>
        </CitationIcons>
        <CitationTitle>Hello</CitationTitle>
      </Citation>
      <Citation onClick={() => alert("Close action clicked")}>
        <CitationIcons>
          <Icon visual={NotionLogo} size="sm" />
          <CitationIndex>2</CitationIndex>
        </CitationIcons>
        <CitationTitle>Hello</CitationTitle>
      </Citation>
      <Citation onClick={() => alert("Close action clicked")}>
        <CitationIcons>
          <Icon visual={DocumentIcon} size="sm" />
          <CitationIndex>3</CitationIndex>
        </CitationIcons>
        <CitationTitle>Hello</CitationTitle>
      </Citation>
      <Citation onClick={() => alert("Close action clicked")}>
        <CitationIcons>
          <FaviconIcon websiteUrl="https://stackoverflow.com" size="sm" />
          <CitationIndex>4</CitationIndex>
        </CitationIcons>
        <CitationTitle>Stack Overflow Answer</CitationTitle>
      </Citation>
      <Citation onClick={() => alert("Close action clicked")}>
        <CitationIcons>
          <FaviconIcon websiteUrl="https://www.wikipedia.org" size="sm" />
          <CitationIndex>5</CitationIndex>
        </CitationIcons>
        <CitationTitle>Wikipedia Article</CitationTitle>
      </Citation>
    </CitationGrid>
    Example of interactive content (list variant)
    <CitationGrid variant="list">
      <Citation onClick={() => alert("Interactive content clicked")}>
        <CitationTitle>Analytics Dashboard</CitationTitle>
        <CitationDescription>Visualization</CitationDescription>
      </Citation>
      <Citation onClick={() => alert("Interactive content clicked")}>
        <CitationTitle>Customer Data Analysis</CitationTitle>
        <CitationDescription>Interactive Content</CitationDescription>
      </Citation>
      <Citation onClick={() => alert("Interactive content clicked")}>
        <CitationTitle>Sales Report Generator</CitationTitle>
        <CitationDescription>Visualization</CitationDescription>
      </Citation>
    </CitationGrid>
  </div>
);
