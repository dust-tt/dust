import type { Meta } from "@storybook/react";
import React from "react";

import {
  CitationNew,
  CitationNewClose,
  CitationNewDescription,
  CitationNewIcons,
  CitationNewIndex,
  CitationNewTitle,
  Icon,
  SlackLogo,
} from "../index_with_tw_base";

const meta = {
  title: "Components/CitationNew",
  component: CitationNew,
} satisfies Meta<typeof CitationNew>;

export default meta;

export const CitationsExample = () => (
  <div className="s-flex s-flex-col s-gap-8">
    <CitationNew
      onClose={() => alert("Close action clicked")}
      className="s-w-48"
      isBlinking={true}
    >
      <CitationNewIcons>
        <CitationNewIndex>1</CitationNewIndex>
        <Icon visual={SlackLogo} size="sm" />
      </CitationNewIcons>
      <CitationNewTitle>Hello</CitationNewTitle>
      <CitationNewDescription>This is a citation</CitationNewDescription>
      <CitationNewClose />
    </CitationNew>
    <div className="s-grid s-grid-cols-4 s-gap-2">
      <CitationNew
        onClose={() => alert("Close action clicked")}
        isBlinking={true}
      >
        <CitationNewIcons>
          <CitationNewIndex>1</CitationNewIndex>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
        <CitationNewDescription>This is a citation</CitationNewDescription>
        <CitationNewClose />
      </CitationNew>
      <CitationNew
        onClose={() => alert("Close action clicked")}
        isBlinking={true}
      >
        <CitationNewIcons>
          <CitationNewIndex>1</CitationNewIndex>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
        <CitationNewDescription>This is a citation</CitationNewDescription>
        <CitationNewClose />
      </CitationNew>
      <CitationNew
        onClose={() => alert("Close action clicked")}
        isBlinking={true}
      >
        <CitationNewIcons>
          <CitationNewIndex>1</CitationNewIndex>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
        <CitationNewDescription>This is a citation</CitationNewDescription>
        <CitationNewClose />
      </CitationNew>
      <CitationNew
        onClose={() => alert("Close action clicked")}
        isBlinking={true}
      >
        <CitationNewIcons>
          <CitationNewIndex>1</CitationNewIndex>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
        <CitationNewDescription>This is a citation</CitationNewDescription>
        <CitationNewClose />
      </CitationNew>
    </div>
    <div className="s-grid s-grid-cols-6 s-gap-2">
      <CitationNew
        onClose={() => alert("Close action clicked")}
        isBlinking={true}
      >
        <CitationNewIcons>
          <CitationNewIndex>1</CitationNewIndex>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
        <CitationNewDescription>This is a citation</CitationNewDescription>
        <CitationNewClose />
      </CitationNew>
      <CitationNew
        onClose={() => alert("Close action clicked")}
        isBlinking={true}
      >
        <CitationNewIcons>
          <CitationNewIndex>1</CitationNewIndex>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
        <CitationNewDescription>This is a citation</CitationNewDescription>
        <CitationNewClose />
      </CitationNew>
      <CitationNew
        onClose={() => alert("Close action clicked")}
        isBlinking={true}
      >
        <CitationNewIcons>
          <CitationNewIndex>1</CitationNewIndex>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
        <CitationNewDescription>This is a citation</CitationNewDescription>
        <CitationNewClose />
      </CitationNew>
      <CitationNew
        onClose={() => alert("Close action clicked")}
        isBlinking={true}
      >
        <CitationNewIcons>
          <CitationNewIndex>1</CitationNewIndex>
          <Icon visual={SlackLogo} size="sm" />
        </CitationNewIcons>
        <CitationNewTitle>Hello</CitationNewTitle>
        <CitationNewDescription>This is a citation</CitationNewDescription>
        <CitationNewClose />
      </CitationNew>
    </div>
  </div>
);
