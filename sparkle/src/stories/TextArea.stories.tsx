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
          onChange={(e) => {
            console.log(e.target.value);
            setTextValues([
              e.target.value,
              textValues[1],
              textValues[2],
              textValues[3],
            ]);
          }}
          minRows={2}
          defaultValue={textValues[0]}
        />
        <TextArea
          placeholder="placeholder"
          defaultValue={textValues[1]}
          error={"errored because blah"}
          onChange={(e) =>
            setTextValues([
              textValues[0],
              e.target.value,
              textValues[2],
              textValues[3],
            ])
          }
          showErrorLabel
        />
        <TextArea
          placeholder="placeholder"
          defaultValue={textValues[2]}
          onChange={(e) =>
            setTextValues([
              textValues[0],
              textValues[1],
              e.target.value,
              textValues[3],
            ])
          }
          error={"errored because blah"}
        />
      </div>
    </div>
  );
};
