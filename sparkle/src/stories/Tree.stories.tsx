import type { Meta } from "@storybook/react";
import React from "react";
import { v4 as uuidv4 } from "uuid";

import { Dust } from "@sparkle/icons/solid";

import {
  Button,
  Chip,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  DriveLogo,
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
            <Tree>
              <Tree.Item
                label="Intercom"
                type="item"
                visual={<IntercomLogo />}
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
                visual={<NotionLogo />}
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
                visual={<SlackLogo />}
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
                visual={<Dust />}
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
            <Tree isBoxed>
              <Tree.Item
                label="Intercom"
                type="item"
                visual={<IntercomLogo />}
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
                visual={<NotionLogo />}
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
                visual={<SlackLogo />}
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
                visual={<Dust />}
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

export const SelectDataSourceExample = () => {
  return (
    <div className="s-flex s-w-full s-flex-col s-gap-10">
      <div className="s-flex s-grow s-gap-10">
        <div className="w-full s-flex s-flex-col s-gap-3">
          <div className="s-text-xl">Display Data source Tree example</div>
          <div className="w-full">
            <Tree>
              <Tree.Item
                label="Intercom"
                visual={<IntercomLogo />}
                size="md"
                areActionsFading={false}
                actions={
                  <div className="s-flex s-flex-row s-items-center s-justify-center s-gap-3">
                    <span className="s-text-sm s-text-element-700">
                      Managed by: Stanislas Polu
                    </span>
                    <Chip size="sm" color="pink" label="Syncing (235)" />
                    <Button
                      label="Manage"
                      icon={Cog6ToothIcon}
                      variant="tertiary"
                      size="sm"
                      hasMagnifying={false}
                    />
                  </div>
                }
              />
              <Tree.Item
                label="Slack"
                collapsed={true}
                visual={<SlackLogo />}
                areActionsFading={false}
                actions={
                  <div className="s-flex s-flex-row s-items-center s-justify-center s-gap-3">
                    <span className="s-text-sm s-text-element-700">
                      Managed by: Stanislas Polu
                    </span>
                    <Chip size="sm" color="pink" label="Syncing (235)" />
                    <Button
                      label="Manage"
                      icon={Cog6ToothIcon}
                      variant="tertiary"
                      size="sm"
                      hasMagnifying={false}
                    />
                  </div>
                }
                size="md"
              />
              <Tree.Item
                label="Notion"
                visual={<NotionLogo />}
                areActionsFading={false}
                size="md"
                actions={
                  <div className="s-flex s-flex-row s-items-center s-justify-center s-gap-3">
                    <span className="s-text-sm s-text-element-700">
                      Managed by: Stanislas Polu
                    </span>
                    <Chip size="sm" color="pink" label="Syncing (235)" />
                    <Button
                      label="Manage"
                      icon={Cog6ToothIcon}
                      variant="tertiary"
                      size="sm"
                      hasMagnifying={false}
                    />
                  </div>
                }
                collapsed={false}
              >
                <Tree>
                  <Tree.Item label="item 1" />
                  <Tree.Item label="item 2" />
                  <Tree.Item label="item 3" />
                  <Tree.Item label="item 4" />
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="Google Drive"
                visual={<DriveLogo />}
                areActionsFading={false}
                size="md"
                defaultCollapsed={true}
                actions={
                  <div className="s-flex s-flex-row s-items-center s-justify-center s-gap-3">
                    <span className="s-text-sm s-text-element-700">
                      Managed by: Stanislas Polu
                    </span>
                    <Chip size="sm" color="pink" label="Syncing (235)" />
                    <Button
                      label="Manage"
                      icon={Cog6ToothIcon}
                      variant="tertiary"
                      size="sm"
                      hasMagnifying={false}
                    />
                  </div>
                }
              />
            </Tree>
          </div>
        </div>
      </div>
      <div className="s-flex s-gap-10">
        <div className="s-flex s-flex-col s-gap-3">
          <div className="s-text-xl">Select Data source Tree example</div>
          <div>
            <Tree>
              <Tree.Item
                label="Intercom"
                visual={<IntercomLogo />}
                size="md"
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
                collapsed={true}
                visual={<SlackLogo />}
                size="md"
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
                visual={<NotionLogo />}
                size="md"
                checkbox={{
                  variant: "checkable",
                  checked: false,
                  onChange: () => {
                    return;
                  },
                }}
                collapsed={false}
              >
                <Tree>
                  <Tree.Item
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
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="Google Drive"
                visual={<DriveLogo />}
                size="md"
                checkbox={{
                  variant: "checkable",
                  checked: false,
                  onChange: () => {
                    return;
                  },
                }}
                defaultCollapsed={true}
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
