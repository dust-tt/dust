import type { Meta } from "@storybook/react";
import React from "react";

import { Tree } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Tree",
  component: Tree,
} satisfies Meta<typeof Tree>;

export default meta;

export const TreeExample = () => {
  return (
    <div className="s-flex s-gap-10">
      <div className="s-flex s-flex-col s-gap-3">
        <div className="s-text-xl">Tree</div>
        <div>
          <Tree>
            <Tree.Item label="item 1" variant="folder" />
            <Tree.Item label="item 2" variant="folder">
              <Tree isLoading />
            </Tree.Item>
            <Tree.Item label="item 3" variant="folder">
              <Tree>
                <Tree.Item label="item 1" />
                <Tree.Item label="item 2" />
                <Tree.Item label="item 3" />
              </Tree>
            </Tree.Item>
            <Tree.Item label="item 4" variant="folder" />
            <Tree.Item label="item 5" variant="folder">
              <Tree>
                <Tree.Item label="item 1" />
                <Tree.Item label="item 2" />
                <Tree.Item label="item 3" />
                <Tree.Item label="item 4" />
                <Tree.Item label="item 5" />
              </Tree>
            </Tree.Item>
          </Tree>
        </div>
      </div>
      <div className="s-flex s-flex-col s-gap-3">
        <div className="s-text-xl">Flat</div>
        <div>
          <Tree>
            <Tree.Item label="item 1" type="item" variant="channel" />
            <Tree.Item label="item 2" type="item" variant="channel" />
            <Tree.Item label="item 3" type="item" variant="channel" />
            <Tree.Item label="item 4" type="item" variant="channel" />
            <Tree.Item label="item 5" type="item" variant="channel" />
          </Tree>
        </div>
      </div>
    </div>
  );
};
