import type { Meta } from "@storybook/react";
import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";

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
                <Tree.Item
                  type="leaf"
                  label="item 1"
                  checkbox={{
                    variant: "checkable",
                    checked: false,
                    onChange: () => {
                      return;
                    },
                  }}
                />
                <Tree.Item
                  label="item 2"
                  type="leaf"
                  checkbox={{
                    variant: "checkable",
                    checked: false,
                    onChange: () => {
                      return;
                    },
                  }}
                />
                <Tree.Item
                  label="item 3"
                  type="leaf"
                  checkbox={{
                    variant: "checkable",
                    checked: false,
                    onChange: () => {
                      return;
                    },
                  }}
                />
              </Tree>
            </Tree.Item>
            <Tree.Item label="item 4" variant="folder" collapsed={true}>
              <Tree>
                <Tree.Item label="item 1" />
              </Tree>
            </Tree.Item>
            <Tree.Item label="item 5" variant="folder">
              <Tree>
                <Tree.Item
                  label="item 1"
                  checkbox={{
                    variant: "checkable",
                    checked: true,
                    partialChecked: true,
                    onChange: () => {
                      return;
                    },
                  }}
                />
                <Tree.Item
                  label="item 2"
                  checkbox={{
                    variant: "checkable",
                    checked: true,
                    onChange: () => {
                      return;
                    },
                  }}
                />
                <Tree.Item
                  label="item 3"
                  checkbox={{
                    variant: "checkable",
                    checked: false,
                    onChange: () => {
                      return;
                    },
                  }}
                />
                <Tree.Item
                  label="item 4"
                  checkbox={{
                    variant: "checkable",
                    checked: false,
                    onChange: () => {
                      return;
                    },
                  }}
                />
                <Tree.Item
                  label="item 5"
                  checkbox={{
                    variant: "checkable",
                    checked: false,
                    onChange: () => {
                      return;
                    },
                  }}
                />
              </Tree>
            </Tree.Item>
          </Tree>
        </div>
      </div>
      <div className="s-flex s-flex-col s-gap-3">
        <div className="s-text-xl">Flat</div>
        <div>
          <Tree>
            <Tree.Item
              label="item 1"
              type="item"
              variant="channel"
              checkbox={{
                variant: "checkable",
                checked: true,
                onChange: () => {
                  return;
                },
              }}
            />
            <Tree.Item
              label="item 2"
              type="item"
              variant="channel"
              checkbox={{
                variant: "checkable",
                checked: true,
                onChange: () => {
                  return;
                },
              }}
            />
            <Tree.Item
              label="item 3"
              type="item"
              variant="channel"
              checkbox={{
                variant: "checkable",
                checked: false,
                onChange: () => {
                  return;
                },
              }}
            />
            <Tree.Item
              label="item 4"
              type="item"
              variant="channel"
              checkbox={{
                variant: "checkable",
                checked: false,
                onChange: () => {
                  return;
                },
              }}
            />
            <Tree.Item
              label="item 5"
              type="item"
              variant="channel"
              checkbox={{
                variant: "checkable",
                checked: false,
                onChange: () => {
                  return;
                },
              }}
            />
          </Tree>
        </div>
      </div>
    </div>
  );
};

const TreeItem = ({ label }: { label: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const n = Math.floor(Math.random() * 8) + 3;
  return (
    <Tree.Item
      label={label}
      variant="folder"
      collapsed={!isOpen}
      onChevronClick={() => setIsOpen(!isOpen)}
    >
      {isOpen && <Tree>{createTreeItems(n)}</Tree>}
    </Tree.Item>
  );
};

const createTreeItems = (n = 5) => {
  const items = [];
  for (let i = 1; i <= n; i++) {
    const label = `${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}`;
    items.push(<TreeItem key={label} label={label} />);
  }

  return <Tree>{items}</Tree>;
};

export const DeeplyNestedTree = () => {
  return (
    <div className="s-mx-auto s-max-w-2xl s-gap-3">
      <div className="s-text-xl">Huge</div>
      <div>
        <Tree>{createTreeItems(20)}</Tree>
      </div>
    </div>
  );
};
