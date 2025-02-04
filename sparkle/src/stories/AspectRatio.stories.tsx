import type { Meta } from "@storybook/react";
import React from "react";

import { AspectRatio } from "../index_with_tw_base";

const meta = {
  title: "Layouts/AspectRatio",
  component: AspectRatio,
} satisfies Meta;

export default meta;

export const Demo = () => {
  return (
    <div className="s-flex s-flex-col s-gap-12">
      <Demo169 />
      <Demo43 />
    </div>
  );
};

export const Demo169 = () => {
  return (
    <div className="s-grid s-grid-cols-3 s-gap-4">
      <AspectRatio
        ratio={16 / 9}
        className="s-flex s-items-center s-justify-center s-overflow-hidden s-bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={16 / 9}
        className="s-flex s-items-center s-justify-center s-overflow-hidden s-bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={16 / 9}
        className="s-flex s-items-center s-justify-center s-overflow-hidden s-bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={16 / 9}
        className="s-flex s-items-center s-justify-center s-overflow-hidden s-bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={16 / 9}
        className="s-flex s-items-center s-justify-center s-overflow-hidden s-bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={16 / 9}
        className="s-flex s-items-center s-justify-center s-overflow-hidden s-bg-muted"
      >
        Hello
      </AspectRatio>
    </div>
  );
};
export const Demo43 = () => {
  return (
    <div className="s-grid s-grid-cols-3 s-gap-4">
      <AspectRatio
        ratio={4 / 3}
        className="s-flex s-items-center s-justify-center s-overflow-hidden s-bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={4 / 3}
        className="s-flex s-items-center s-justify-center s-overflow-hidden s-bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={4 / 3}
        className="s-flex s-items-center s-justify-center s-overflow-hidden s-bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={4 / 3}
        className="s-flex s-items-center s-justify-center s-overflow-hidden s-bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={4 / 3}
        className="s-flex s-items-center s-justify-center s-overflow-hidden s-bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={4 / 3}
        className="s-flex s-items-center s-justify-center s-overflow-hidden s-bg-muted"
      >
        Hello
      </AspectRatio>
    </div>
  );
};
