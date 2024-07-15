import type { Meta } from "@storybook/react";
import React from "react";
import { v4 as uuidv4 } from "uuid";

import { Dust } from "@sparkle/icons/solid";

import {
  CloudArrowDownIcon,
  IconButton,
  IntercomLogo,
  NotionLogo,
  PlusCircleIcon,
  SlackLogo,
  Tree,
} from "../index_with_tw_base";

const meta = {
  title: "Components/Tree",
  component: Tree,
} satisfies Meta<typeof Tree>;

export default meta;

export const TreeExample = () => {
  return (
    <div className="s-flex s-flex-col s-gap-10">
      <div className="s-flex s-gap-10">
        <div className="s-flex s-flex-col s-gap-3">
          <div className="s-text-xl">Tree</div>
          <div>
            <Tree isBoxed>
              <Tree.Item label="item 1 (no children)" variant="folder" />
              <Tree.Item label="item 2 (loading)" variant="folder">
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
              <Tree.Item
                label="item 4 (forced collapsed)"
                variant="folder"
                collapsed={true}
              >
                <Tree>
                  <Tree.Item label="item 1" />
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="item 5 (forced expanded)"
                variant="folder"
                collapsed={false}
              >
                <Tree>
                  <Tree.Item label="item 1" />
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="item 6 (default collapsed)"
                variant="folder"
                defaultCollapsed={true}
              >
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

              <Tree.Item
                label="item 7 (default expanded)"
                variant="folder"
                defaultCollapsed={false}
              >
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
                </Tree>
              </Tree.Item>
            </Tree>
          </div>
        </div>
        <div className="s-flex s-flex-col s-gap-3">
          <div className="s-text-xl">Flat</div>
          <div>
            <Tree isBoxed>
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
        <div className="s-flex s-flex-col s-gap-3">
          <div className="s-text-xl">With custom visual</div>
          <div>
            <Tree isBoxed>
              <Tree.Item
                label="Intercom"
                type="item"
                visual={<IntercomLogo className="s-h-5 s-w-5" />}
                checkbox={{
                  variant: "checkable",
                  checked: false,
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Notion"
                type="item"
                visual={<NotionLogo className="s-h-5 s-w-5" />}
                checkbox={{
                  variant: "checkable",
                  checked: false,
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Slack"
                type="item"
                visual={<SlackLogo className="s-h-5 s-w-5" />}
                checkbox={{
                  variant: "checkable",
                  checked: false,
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Dust"
                type="item"
                visual={<Dust color="pink" className="s-h-5 s-w-5" />}
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
      <div className="s-flex s-gap-10">
        <div className="s-flex s-flex-col s-gap-3">
          <div className="s-text-xl">Tree</div>
          <div>
            <Tree>
              <Tree.Item label="item 1 (no children)" variant="folder" />
              <Tree.Item label="item 2 (loading)" variant="folder">
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
              <Tree.Item
                label="item 4 (forced collapsed)"
                variant="folder"
                collapsed={true}
              >
                <Tree>
                  <Tree.Item label="item 1" />
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="item 5 (forced expanded)"
                variant="folder"
                collapsed={false}
              >
                <Tree>
                  <Tree.Item label="item 1" />
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="item 6 (default collapsed)"
                variant="folder"
                defaultCollapsed={true}
              >
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

              <Tree.Item
                label="item 7 (default expanded)"
                variant="folder"
                defaultCollapsed={false}
              >
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
        <div className="s-flex s-flex-col s-gap-3">
          <div className="s-text-xl">With custom visual</div>
          <div>
            <Tree>
              <Tree.Item
                label="Intercom"
                type="item"
                visual={<IntercomLogo className="s-h-5 s-w-5" />}
                checkbox={{
                  variant: "checkable",
                  checked: false,
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Notion"
                type="item"
                visual={<NotionLogo className="s-h-5 s-w-5" />}
                checkbox={{
                  variant: "checkable",
                  checked: false,
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Slack"
                type="item"
                visual={<SlackLogo className="s-h-5 s-w-5" />}
                checkbox={{
                  variant: "checkable",
                  checked: false,
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Dust"
                type="item"
                visual={<Dust color="pink" className="s-h-5 s-w-5" />}
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
    </div>
  );
};

const TreeItem = ({
  label,
  getLabel,
}: {
  label: string;
  getLabel: () => string;
}) => {
  const n = Math.floor(Math.random() * 8) + 3;
  return (
    <Tree.Item
      label={label}
      variant="folder"
      actions={
        <div className="s-flex s-flex-row s-justify-center s-gap-2">
          <span className="s-text-xs s-text-element-700">
            last updated Jan 6
          </span>
          <IconButton icon={CloudArrowDownIcon} size="xs" variant="tertiary" />
          <IconButton icon={PlusCircleIcon} size="xs" />
        </div>
      }
      renderTreeItems={() => <Tree>{createTreeItems(n, getLabel)}</Tree>}
    />
  );
};

const createTreeItems = (n = 5, getLabel: () => string) => {
  const items = [];
  for (let i = 1; i <= n; i++) {
    const label = getLabel();
    items.push(<TreeItem key={label} label={label} getLabel={getLabel} />);
  }

  return <Tree>{items}</Tree>;
};

export const DeeplyNestedTreeWithActions = () => {
  const getLabel = () =>
    `${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}-${uuidv4()}`;
  return (
    <div className="s-mx-auto s-max-w-2xl s-gap-3 s-pt-10">
      <div className="s-pb-10 s-text-xl">Huge</div>
      <div>
        <Tree>{createTreeItems(20, getLabel)}</Tree>
      </div>
    </div>
  );
};

export const SmallTreeWithActions = () => {
  const getLabel = () =>
    `${uuidv4().slice(0, Math.floor(Math.random() * 32) + 3)}`;
  return (
    <div className="s-mx-auto s-max-w-2xl s-gap-3 s-pt-10">
      <div className="s-pb-10 s-text-xl">Huge</div>
      <div>
        <Tree>{createTreeItems(5, getLabel)}</Tree>
      </div>
    </div>
  );
};
