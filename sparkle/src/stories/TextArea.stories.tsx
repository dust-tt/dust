import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { TextArea } from "../index_with_tw_base";

const meta = {
  title: "Primitives/TextArea",
  component: TextArea,
} satisfies Meta<typeof TextArea>;

export default meta;

export const TextAreaExample = () => {
  const [textValues, setTextValues] = useState([
    "",
    "Error with label",
    "Error no label",
    "",
  ]);
  return (
    <div className="s-flex s-flex-col s-gap-20">
      <div className="s-grid s-grid-cols-3 s-gap-4">
        <TextArea
          placeholder="placeholder"
          value={textValues[0]}
          onChange={(v) =>
            setTextValues([v, textValues[1], textValues[2], textValues[3]])
          }
          rows={2}
        />
        <TextArea
          placeholder="placeholder"
          value={textValues[1]}
          error={"errored because blah"}
          onChange={(v) =>
            setTextValues([textValues[0], v, textValues[2], textValues[3]])
          }
          showErrorLabel
        />
        <TextArea
          placeholder="placeholder"
          value={textValues[2]}
          onChange={(v) =>
            setTextValues([textValues[0], textValues[1], v, textValues[3]])
          }
          error={"errored because blah"}
        />
      </div>
    </div>
  );
};
