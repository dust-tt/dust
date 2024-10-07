import type { Meta } from "@storybook/react";
import React from "react";

import {
  DriveLogo,
  IntercomLogo,
  NotionLogo,
  SlackLogo,
} from "@sparkle/logo/platforms";

import {
  Button,
  Chip,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  DocumentIcon,
  DustIcon,
  EyeIcon,
  FolderIcon,
  IconButton,
  PlusCircleIcon,
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
            <Tree>
              <Tree.Item label="Item 1 (no children)" visual={FolderIcon} />
              <Tree.Item label="Item 2 (loading)" visual={FolderIcon}>
                <Tree isLoading />
              </Tree.Item>
              <Tree.Item label="Item 3" visual={FolderIcon}>
                <Tree>
                  <Tree.Item
                    type="leaf"
                    label="Item 1"
                    checkbox={{
                      variant: "checkable",
                      checked: "unchecked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 2"
                    type="leaf"
                    checkbox={{
                      variant: "checkable",
                      checked: "unchecked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 3"
                    type="leaf"
                    checkbox={{
                      variant: "checkable",
                      checked: "unchecked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="Item 4 (forced collapsed)"
                visual={FolderIcon}
                collapsed={false}
              >
                <Tree>
                  <Tree.Item
                    label="Item 1"
                    visual={FolderIcon}
                    collapsed={false}
                  >
                    <Tree.Item
                      label="Item 3"
                      type="leaf"
                      visual={DocumentIcon}
                    />
                    <Tree.Item
                      label="Item 3"
                      type="leaf"
                      visual={DocumentIcon}
                    />
                    <Tree.Empty label="(+ 4 items)" />
                  </Tree.Item>
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="Item 5 (forced expanded)"
                visual={FolderIcon}
                collapsed={false}
              >
                <Tree>
                  <Tree.Item
                    label="Item 1"
                    visual={DocumentIcon}
                    type="leaf"
                    actions={
                      <>
                        <div className="s-text-sm s-text-element-700">
                          hello
                        </div>
                        <IconButton
                          size="xs"
                          icon={EyeIcon}
                          variant="tertiary"
                        />
                      </>
                    }
                  />
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="Item 6 (default collapsed)"
                visual={FolderIcon}
                defaultCollapsed={true}
              >
                <Tree>
                  <Tree.Item label="Item 1" visual={DocumentIcon} />
                </Tree>
              </Tree.Item>

              <Tree.Item
                label="Item 7 (default expanded)"
                visual={FolderIcon}
                defaultCollapsed={false}
              >
                <Tree>
                  <Tree.Item label="Item 1" visual={DocumentIcon} />
                  <Tree.Item label="Item 2" visual={DocumentIcon} />
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
                label="Item 1"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  variant: "checkable",
                  checked: "checked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Item 2"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  variant: "checkable",
                  checked: "checked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Item 3"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Item 4"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Item 5"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
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
                visual={IntercomLogo}
                type="item"
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Notion"
                type="item"
                visual={NotionLogo}
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Slack"
                type="item"
                visual={SlackLogo}
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Dust"
                type="item"
                visual={DustIcon}
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
            </Tree>
          </div>
        </div>
        <div className="s-flex s-max-w-xs s-flex-col s-gap-3">
          <div className="s-text-xl">Nav bar</div>
          <div>
            <Tree variant="navigator">
              <Tree.Item
                label="Intercom  github.com-apache-incubator-devlake-tree-main-backend"
                visual={IntercomLogo}
                onItemClick={() => console.log("Clickable")}
                isSelected={true}
                size="md"
              >
                <Tree variant="navigator" tailwindIconTextColor="s-text-brand">
                  <Tree.Item
                    label="Item 1 with a very very very very very very very long text"
                    visual={FolderIcon}
                  >
                    <Tree variant="navigator">
                      <Tree.Item
                        label="Item 1 with a very very very very very very very long text"
                        visual={FolderIcon}
                        type="leaf"
                      />
                      <Tree.Item label="Item 2" visual={FolderIcon} />
                      <Tree.Item label="Item 3" visual={FolderIcon} />
                    </Tree>
                  </Tree.Item>
                  <Tree.Item
                    label="Item 2"
                    visual={FolderIcon}
                    tailwindIconTextColor="s-text-brand"
                  >
                    <Tree variant="navigator">
                      <Tree.Item label="Item 1" visual={FolderIcon} />
                      <Tree.Item label="Item 2" visual={FolderIcon} />
                      <Tree.Item label="Item 3" visual={FolderIcon} />
                    </Tree>
                  </Tree.Item>
                  <Tree.Item
                    label="Item 3"
                    visual={FolderIcon}
                    tailwindIconTextColor="s-text-brand"
                  >
                    <Tree variant="navigator">
                      <Tree.Item label="Item 1" visual={FolderIcon} />
                      <Tree.Item label="Item 2" visual={FolderIcon} />
                      <Tree.Item label="Item 3" visual={FolderIcon} />
                    </Tree>
                  </Tree.Item>
                </Tree>
              </Tree.Item>
              <Tree.Item label="Notion" visual={NotionLogo} size="md" />
              <Tree.Item label="Slack" visual={SlackLogo} size="md" />
              <Tree.Item label="Dust" visual={DustIcon} size="md" />
            </Tree>
          </div>
        </div>
      </div>

      <div className="s-flex s-gap-10">
        <div className="s-flex s-flex-col s-gap-3">
          <div className="s-text-xl">Tree</div>
          <div>
            <Tree isBoxed>
              <Tree.Item label="Item 1 (no children)" visual={FolderIcon} />
              <Tree.Item label="Item 2 (loading)" visual={FolderIcon}>
                <Tree isLoading />
              </Tree.Item>
              <Tree.Item label="Item 3" visual={FolderIcon}>
                <Tree>
                  <Tree.Item
                    type="leaf"
                    label="Item 1"
                    checkbox={{
                      variant: "checkable",
                      checked: "unchecked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 2"
                    type="leaf"
                    checkbox={{
                      variant: "checkable",
                      checked: "unchecked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 3"
                    type="leaf"
                    checkbox={{
                      variant: "checkable",
                      checked: "unchecked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="Item 4 (forced collapsed)"
                visual={FolderIcon}
                collapsed={true}
              >
                <Tree>
                  <Tree.Item label="Item 1" />
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="Item 5 (forced expanded)"
                visual={FolderIcon}
                collapsed={false}
              >
                <Tree>
                  <Tree.Item label="Item 1" collapsed={false}>
                    <Tree>
                      <Tree.Empty label="No documents" />
                    </Tree>
                  </Tree.Item>
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="Item 6 (default collapsed)"
                visual={FolderIcon}
                defaultCollapsed={true}
              >
                <Tree>
                  <Tree.Item
                    label="Item 1"
                    checkbox={{
                      variant: "checkable",
                      checked: "partial",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 2"
                    checkbox={{
                      variant: "checkable",
                      checked: "checked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 3"
                    checkbox={{
                      variant: "checkable",
                      checked: "unchecked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 4"
                    checkbox={{
                      variant: "checkable",
                      checked: "unchecked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 5"
                    checkbox={{
                      variant: "checkable",
                      checked: "unchecked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                </Tree>
              </Tree.Item>

              <Tree.Item
                label="Item 7 (default expanded)"
                visual={FolderIcon}
                defaultCollapsed={false}
              >
                <Tree>
                  <Tree.Item
                    label="Item 1"
                    checkbox={{
                      variant: "checkable",
                      checked: "partial",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 2"
                    checkbox={{
                      variant: "checkable",
                      checked: "checked",
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
                label="Item 1"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  variant: "checkable",
                  checked: "checked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Item 2"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  variant: "checkable",
                  checked: "checked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Item 3"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Item 4"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Item 5"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
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
                visual={IntercomLogo}
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Notion"
                type="item"
                visual={NotionLogo}
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Slack"
                type="item"
                visual={SlackLogo}
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Dust"
                type="item"
                visual={DustIcon}
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
            </Tree>
          </div>
        </div>
        <div className="s-flex s-flex-col s-gap-3">
          <div className="s-text-xl">Nav bar</div>
          <div>
            <Tree isBoxed variant="navigator">
              <Tree.Item
                label="Intercom"
                visual={IntercomLogo}
                onItemClick={() => console.log("Clickable")}
                isSelected={true}
              >
                <Tree tailwindIconTextColor="s-text-brand">
                  <Tree.Item label="Item 1" visual={FolderIcon}>
                    <Tree>
                      <Tree.Item label="Item 1" visual={FolderIcon} />
                      <Tree.Item label="Item 2" visual={FolderIcon} />
                      <Tree.Item label="Item 3" visual={FolderIcon} />
                    </Tree>
                  </Tree.Item>
                  <Tree.Item label="Item 2" visual={FolderIcon}>
                    <Tree>
                      <Tree.Item label="Item 1" visual={FolderIcon} />
                      <Tree.Item label="Item 2" visual={FolderIcon} />
                      <Tree.Item label="Item 3" visual={FolderIcon} />
                    </Tree>
                  </Tree.Item>
                  <Tree.Item label="Item 3" visual={FolderIcon}>
                    <Tree>
                      <Tree.Item label="Item 1" visual={FolderIcon} />
                      <Tree.Item label="Item 2" visual={FolderIcon} />
                      <Tree.Item label="Item 3" visual={FolderIcon} />
                    </Tree>
                  </Tree.Item>
                </Tree>
              </Tree.Item>
              <Tree.Item label="Notion" visual={NotionLogo} />
              <Tree.Item label="Slack" visual={SlackLogo} />
              <Tree.Item label="Dust" visual={DustIcon} />
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
                visual={IntercomLogo}
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
                visual={SlackLogo}
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
                visual={NotionLogo}
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
                  <Tree.Item label="Item 1" />
                  <Tree.Item label="Item 2" />
                  <Tree.Item label="Item 3" />
                  <Tree.Item label="Item 4" />
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="Google Drive"
                visual={DriveLogo}
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
                visual={IntercomLogo}
                size="md"
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Slack"
                collapsed={true}
                visual={SlackLogo}
                size="md"
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Notion"
                visual={NotionLogo}
                size="md"
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
                  onChange: () => {
                    return;
                  },
                }}
                collapsed={false}
              >
                <Tree>
                  <Tree.Item
                    label="Item 1"
                    checkbox={{
                      variant: "checkable",
                      checked: "unchecked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 2"
                    checkbox={{
                      variant: "checkable",
                      checked: "unchecked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 3"
                    checkbox={{
                      variant: "checkable",
                      checked: "unchecked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 4"
                    checkbox={{
                      variant: "checkable",
                      checked: "unchecked",
                      onChange: () => {
                        return;
                      },
                    }}
                  />
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="Google Drive"
                visual={DriveLogo}
                size="md"
                checkbox={{
                  variant: "checkable",
                  checked: "unchecked",
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
      visual={FolderIcon}
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
