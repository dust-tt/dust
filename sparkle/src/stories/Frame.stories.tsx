import type { Meta } from "@storybook/react";
import React from "react";

import { Frame } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Frame",
  component: Frame,
} satisfies Meta<typeof Frame>;

export default meta;

export const FrameEx = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <Frame direction="vertical md:horizontal" gap="sm md:lg">
      <Frame>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque non
        arcu quis ligula dapibus rhoncus. In quis risus ut nunc ultricies
        sagittis. Vivamus quis purus nec ante fermentum facilisis quis a purus.
        Vestibulum vel orci a est lacinia dignissim. Donec imperdiet ante non
        enim vulputate, non interdum ligula feugiat. Sed et libero sed odio
        ullamcorper bibendum. Phasellus luctus dapibus erat, non dapibus nisi
        egestas eget. Sed tincidunt ipsum at velit interdum venenatis. Praesent
        fringilla, ante eget lacinia facilisis, ex justo facilisis erat, a
        volutpat dui lectus et augue. Mauris et eros eu ante sollicitudin
        commodo. Etiam a tellus vel quam fermentum dignissim. Pellentesque non
        lectus quis arcu tincidunt vestibulum. Fusce vehic
      </Frame>
      <Frame>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque non
        arcu quis ligula dapibus rhoncus. In quis risus ut nunc ultricies
        sagittis. Vivamus quis purus nec ante fermentum facilisis quis a purus.
        Vestibulum vel orci a est lacinia dignissim. Donec imperdiet ante non
        enim vulputate, non interdum ligula feugiat. Sed et libero sed odio
        ullamcorper bibendum. Phasellus luctus dapibus erat, non dapibus nisi
        egestas eget. Sed tincidunt ipsum at velit interdum venenatis. Praesent
        fringilla, ante eget lacinia facilisis, ex justo facilisis erat, a
        volutpat dui lectus et augue. Mauris et eros eu ante sollicitudin
        commodo. Etiam a tellus vel quam fermentum dignissim. Pellentesque non
        lectus quis arcu tincidunt vestibulum. Fusce vehic
      </Frame>
    </Frame>
  </div>
);
