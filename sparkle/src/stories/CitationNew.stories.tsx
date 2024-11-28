import type { Meta } from "@storybook/react";
import React from "react";

import {
  CitationNew,
  CitationNewClose,
  CitationNewDescription,
  CitationNewIcons,
  CitationNewImage,
  CitationNewIndex,
  CitationNewTitle,
  DocumentIcon,
  GlobeAltIcon,
  Icon,
  ImageIcon,
  NotionLogo,
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
        isBlinking={true}
      >
        <CitationNewIcons>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Slack thread</CitationNewTitle>
        <CitationNewDescription>
          @ed at 16:32 This is the latest ve
        </CitationNewDescription>
      </CitationNew>
      <CitationNew
        onClick={() => alert("Card clicked")}
        className="s-w-48"
        isBlinking={true}
      >
        <CitationNewIcons>
          <Icon visual={TableIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>extract_financa.csv</CitationNewTitle>
      </CitationNew>
      <CitationNew
        onClick={() => alert("Card clicked")}
        className="s-w-48"
        isBlinking={true}
      >
        <CitationNewIcons>
          <Icon visual={GlobeAltIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Linkedin, Edouard Wautier</CitationNewTitle>
      </CitationNew>

      <CitationNew
        onClick={() => alert("Card clicked")}
        className="s-w-48"
        isBlinking={true}
      >
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
      <CitationNew
        onClick={() => alert("Card clicked")}
        className="s-w-48"
        isBlinking={true}
      >
        <CitationNewIcons>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Slack thread</CitationNewTitle>
        <CitationNewClose onClick={() => alert("Close clicked")} />
        <CitationNewDescription>
          @ed at 16:32 This is the latest ve
        </CitationNewDescription>
      </CitationNew>
      <CitationNew
        onClick={() => alert("Card clicked")}
        className="s-w-48"
        isBlinking={true}
      >
        <CitationNewIcons>
          <Icon visual={TableIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewClose onClick={() => alert("Close clicked")} />
        <CitationNewTitle>extract_financa.csv</CitationNewTitle>
      </CitationNew>
      <CitationNew
        onClick={() => alert("Card clicked")}
        className="s-w-48"
        isBlinking={true}
      >
        <CitationNewIcons>
          <Icon visual={GlobeAltIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewClose onClick={() => alert("Close clicked")} />
        <CitationNewTitle>Linkedin, Edouard Wautier</CitationNewTitle>
      </CitationNew>

      <CitationNew
        onClick={() => alert("Card clicked")}
        className="s-w-48"
        isBlinking={true}
      >
        <CitationNewImage imgSrc="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg" />
        <CitationNewIcons>
          <Icon visual={ImageIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewClose onClick={() => alert("Close clicked")} />
        <CitationNewTitle>screenshot.png</CitationNewTitle>
      </CitationNew>
    </div>
    Example of citations in a grid
    <div className="s-grid s-grid-cols-5 s-gap-2">
      <CitationNew onClick={() => alert("Card clicked")} isBlinking={true}>
        <CitationNewIcons>
          <CitationNewIndex>1</CitationNewIndex>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
      </CitationNew>
      <CitationNew
        onClick={() => alert("Close action clicked")}
        isBlinking={true}
      >
        <CitationNewIcons>
          <CitationNewIndex>2</CitationNewIndex>
          <Icon visual={NotionLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
      </CitationNew>
      <CitationNew
        onClick={() => alert("Close action clicked")}
        isBlinking={true}
      >
        <CitationNewIcons>
          <CitationNewIndex>3</CitationNewIndex>
          <Icon visual={DocumentIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
      </CitationNew>
      <CitationNew
        onClick={() => alert("Close action clicked")}
        isBlinking={true}
      >
        <CitationNewIcons>
          <CitationNewIndex>4</CitationNewIndex>
          <Icon visual={GlobeAltIcon} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
      </CitationNew>
    </div>
  </div>
);
