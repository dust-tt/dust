import type { Meta } from "@storybook/react";
import React, { useState } from "react";

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
  HistoryIcon,
  Icon,
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
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const check = (id: string) => {
    setChecked((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

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
                      checked: checked["Item 1"],
                      onCheckedChange: () => {
                        check("Item 1");
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 2"
                    type="leaf"
                    checkbox={{
                      checked: checked["Item 2"],
                      onCheckedChange: () => {
                        check("Item 2");
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 3"
                    type="leaf"
                    checkbox={{
                      checked: checked["Item 3"],
                      onCheckedChange: () => {
                        check("Item 3");
                      },
                    }}
                  />
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="Item 4 (forced expanded)"
                visual={FolderIcon}
                collapsed={false}
              >
                <Tree>
                  <Tree.Item
                    label="Item 1"
                    visual={FolderIcon}
                    defaultCollapsed={false}
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
                        <div className="s-text-sm s-text-muted-foreground">
                          hello
                        </div>
                        <IconButton
                          size="xs"
                          icon={EyeIcon}
                          variant="outline"
                        />
                      </>
                    }
                  />

                  <Tree.Item
                    label="t"
                    visual={DocumentIcon}
                    type="leaf"
                    actions={
                      <div className="s-flex s-grow s-flex-row s-items-center s-justify-between">
                        <Button size="mini" variant="outline" icon={EyeIcon} />
                        <div className="s-flex s-flex-row s-items-center s-gap-1 s-text-sm s-text-muted-foreground">
                          <Icon visual={HistoryIcon} size="xs" />
                          1y
                        </div>
                      </div>
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
              <Tree.Item
                label="Item 8 (loading, with existing nodes)"
                visual={FolderIcon}
              >
                <Tree isLoading>
                  <Tree.Item
                    type="leaf"
                    label="Item 1"
                    checkbox={{
                      checked: checked["Item 1"],
                      onCheckedChange: () => {
                        check("Item 1");
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
                label="Item 1"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  checked: "partial",
                  onCheckedChange: () => {
                    return;
                  },
                }}
              />
              <Tree.Item
                label="Item 2"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  checked: checked["Item 2"],
                  onCheckedChange: () => {
                    check("Item 2");
                  },
                }}
              />
              <Tree.Item
                label="Item 3"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  checked: checked["Item 3"],
                  onCheckedChange: () => {
                    check("Item 3");
                  },
                }}
              />
              <Tree.Item
                label="Item 4"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  checked: checked["Item 4"],
                  onCheckedChange: () => {
                    check("Item 4");
                  },
                }}
              />
              <Tree.Item
                label="Item 5"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  checked: checked["Item 5"],
                  onCheckedChange: () => {
                    check("Item 5");
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
                  checked: checked["Intercom"],
                  onCheckedChange: () => {
                    check("Intercom");
                  },
                }}
              />
              <Tree.Item
                label="Notion"
                type="item"
                visual={NotionLogo}
                checkbox={{
                  checked: checked["Notion"],
                  onCheckedChange: () => {
                    check("Notion");
                  },
                }}
              />
              <Tree.Item
                label="Slack"
                type="item"
                visual={SlackLogo}
                checkbox={{
                  checked: checked["Slack"],
                  onCheckedChange: () => {
                    check("Slack");
                  },
                }}
              />
              <Tree.Item
                label="Dust"
                type="item"
                visual={DustIcon}
                checkbox={{
                  checked: checked["Dust"],
                  onCheckedChange: () => {
                    check("Dust");
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
              >
                <Tree variant="navigator">
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
                  <Tree.Item label="Item 2" visual={FolderIcon}>
                    <Tree variant="navigator">
                      <Tree.Item label="Item 1" visual={FolderIcon} />
                      <Tree.Item label="Item 2" visual={FolderIcon} />
                      <Tree.Item label="Item 3" visual={FolderIcon} />
                    </Tree>
                  </Tree.Item>
                  <Tree.Item label="Item 3" visual={FolderIcon}>
                    <Tree variant="navigator">
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

        <div className="s-flex s-max-w-xs s-flex-col s-gap-3">
          <div className="s-text-xl">Select DataSource</div>
          <div>
            <Tree variant="navigator">
              <Tree.Item
                label="Intercom  github.com-apache-incubator-devlake-tree-main-backend"
                visual={IntercomLogo}
                onItemClick={() => console.log("Clickable")}
                isSelected={true}
              >
                <Tree variant="navigator">
                  <Tree.Item
                    label="Item 1 with a very very very very very very very long text"
                    visual={FolderIcon}
                  >
                    <Tree variant="navigator">
                      <Tree.Item
                        label="Item 1 with a very very very very very very very long text"
                        visual={FolderIcon}
                        type="leaf"
                        checkbox={{
                          checked: checked["Item 1"],
                          onCheckedChange: () => {
                            check("Item 1");
                          },
                        }}
                      />
                      <Tree.Item
                        label="Item 2"
                        visual={FolderIcon}
                        checkbox={{
                          checked: checked["Item 2"],
                          onCheckedChange: () => {
                            check("Item 2");
                          },
                        }}
                      />
                      <Tree.Item
                        label="Item 3"
                        visual={FolderIcon}
                        checkbox={{
                          checked: checked["Item 3"],
                          onCheckedChange: () => {
                            check("Item 3");
                          },
                        }}
                      />
                    </Tree>
                  </Tree.Item>
                  <Tree.Item label="Item 2" visual={FolderIcon}>
                    <Tree variant="navigator">
                      <Tree.Item label="Item 1" visual={FolderIcon} />
                      <Tree.Item label="Item 2" visual={FolderIcon} />
                      <Tree.Item label="Item 3" visual={FolderIcon} />
                    </Tree>
                  </Tree.Item>
                  <Tree.Item label="Item 3" visual={FolderIcon}>
                    <Tree variant="navigator">
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
                      checked: checked["Item 1"],
                      onCheckedChange: () => {
                        check("Item 1");
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 2"
                    type="leaf"
                    checkbox={{
                      checked: checked["Item 2"],
                      onCheckedChange: () => {
                        check("Item 2");
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 3"
                    type="leaf"
                    checkbox={{
                      checked: checked["Item 3"],
                      onCheckedChange: () => {
                        check("Item 3");
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
                  <Tree.Item label="Item 1" defaultCollapsed={false}>
                    <Tree>
                      <Tree.Empty label="No documents" />
                    </Tree>
                  </Tree.Item>
                  <Tree.Item label="Item 2" defaultCollapsed={false}>
                    <Tree>
                      <Tree.Empty
                        label="Empty tree can be clickable"
                        onItemClick={() => alert("Soupinou")}
                      />
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
                      checked: "partial",
                      onCheckedChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 2"
                    checkbox={{
                      checked: checked["Item 2"],
                      onCheckedChange: () => {
                        check("Item 2");
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 3"
                    checkbox={{
                      checked: checked["Item 3"],
                      onCheckedChange: () => {
                        check("Item 3");
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 4"
                    checkbox={{
                      checked: checked["Item 4"],
                      onCheckedChange: () => {
                        check("Item 4");
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 5"
                    checkbox={{
                      checked: checked["Item 5"],
                      onCheckedChange: () => {
                        check("Item 5");
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
                      checked: "partial",
                      onCheckedChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 3"
                    type="leaf"
                    checkbox={{
                      checked: "partial",
                      onCheckedChange: () => {
                        return;
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 2"
                    checkbox={{
                      checked: checked["Item 2"],
                      onCheckedChange: () => {
                        check("Item 2");
                      },
                    }}
                  />
                </Tree>
              </Tree.Item>

              <Tree.Item
                label="Item 8 (loading, with existing nodes)"
                visual={FolderIcon}
              >
                <Tree isLoading>
                  <Tree.Item
                    type="leaf"
                    label="Item 1"
                    checkbox={{
                      checked: checked["Item 1"],
                      onCheckedChange: () => {
                        check("Item 1");
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
                  checked: checked["Item 1"],
                  onCheckedChange: () => {
                    check("Item 1");
                  },
                }}
              />
              <Tree.Item
                label="Item 2"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  checked: checked["Item 2"],
                  onCheckedChange: () => {
                    check("Item 2");
                  },
                }}
              />
              <Tree.Item
                label="Item 3"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  checked: checked["Item 3"],
                  onCheckedChange: () => {
                    check("Item 3");
                  },
                }}
              />
              <Tree.Item
                label="Item 4"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  checked: checked["Item 4"],
                  onCheckedChange: () => {
                    check("Item 4");
                  },
                }}
              />
              <Tree.Item
                label="Item 5"
                type="item"
                visual={FolderIcon}
                checkbox={{
                  checked: checked["Item 5"],
                  onCheckedChange: () => {
                    check("Item 5");
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
                  checked: checked["Intercom"],
                  onCheckedChange: () => {
                    check("Intercom");
                  },
                }}
              />
              <Tree.Item
                label="Notion"
                type="item"
                visual={NotionLogo}
                checkbox={{
                  checked: checked["Notion"],
                  onCheckedChange: () => {
                    check("Notion");
                  },
                }}
              />
              <Tree.Item
                label="Slack"
                type="item"
                visual={SlackLogo}
                checkbox={{
                  checked: checked["Slack"],
                  onCheckedChange: () => {
                    check("Slack");
                  },
                }}
              />
              <Tree.Item
                label="Dust"
                type="item"
                visual={DustIcon}
                checkbox={{
                  checked: checked["Dust"],
                  onCheckedChange: () => {
                    check("Dust");
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
                <Tree tailwindIconTextColor="s-text-foreground">
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
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const check = (id: string) => {
    setChecked((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

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
                areActionsFading={false}
                actions={
                  <div className="s-flex s-flex-row s-items-center s-justify-center s-gap-3">
                    <span className="s-text-sm s-text-muted-foreground">
                      Managed by: Stanislas Polu
                    </span>
                    <Chip size="sm" color="green" label="Syncing (235)" />
                    <Button
                      label="Manage"
                      icon={Cog6ToothIcon}
                      variant="outline"
                      size="sm"
                    />
                  </div>
                }
              />
              <Tree.Item
                label="Slack"
                defaultCollapsed={true}
                visual={SlackLogo}
                areActionsFading={false}
                actions={
                  <div className="s-flex s-flex-row s-items-center s-justify-center s-gap-3">
                    <span className="s-text-sm s-text-muted-foreground">
                      Managed by: Stanislas Polu
                    </span>
                    <Chip size="sm" color="green" label="Syncing (235)" />
                    <Button
                      label="Manage"
                      icon={Cog6ToothIcon}
                      variant="outline"
                      size="sm"
                    />
                  </div>
                }
              />
              <Tree.Item
                label="Notion"
                visual={NotionLogo}
                areActionsFading={false}
                actions={
                  <div className="s-flex s-flex-row s-items-center s-justify-center s-gap-3">
                    <span className="s-text-sm s-text-muted-foreground">
                      Managed by: Stanislas Polu
                    </span>
                    <Chip size="sm" color="green" label="Syncing (235)" />
                    <Button
                      label="Manage"
                      icon={Cog6ToothIcon}
                      variant="outline"
                      size="sm"
                    />
                  </div>
                }
                defaultCollapsed={false}
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
                defaultCollapsed={true}
                actions={
                  <div className="s-flex s-flex-row s-items-center s-justify-center s-gap-3">
                    <span className="s-text-sm s-text-muted-foreground">
                      Managed by: Stanislas Polu
                    </span>
                    <Chip size="sm" color="green" label="Syncing (235)" />
                    <Button
                      label="Manage"
                      icon={Cog6ToothIcon}
                      variant="outline"
                      size="sm"
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
                label="Intercoxxm"
                visual={IntercomLogo}
                checkbox={{
                  checked: checked["Intercom"],
                  onCheckedChange: () => {
                    check("Intercom");
                  },
                }}
              />
              <Tree.Item
                label="Slack"
                defaultCollapsed={true}
                visual={SlackLogo}
                checkbox={{
                  checked: checked["Slack"],
                  onCheckedChange: () => {
                    check("Slack");
                  },
                }}
              />
              <Tree.Item
                label="Notion"
                visual={NotionLogo}
                checkbox={{
                  checked: checked["Notion"],
                  onCheckedChange: () => {
                    check("Notion");
                  },
                }}
                defaultCollapsed={false}
              >
                <Tree>
                  <Tree.Item
                    label="Item 1"
                    checkbox={{
                      checked: checked["Item 1"],
                      onCheckedChange: () => {
                        check("Item 1");
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 2"
                    checkbox={{
                      checked: checked["Item 2"],
                      onCheckedChange: () => {
                        check("Item 2");
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 3"
                    checkbox={{
                      checked: checked["Item 3"],
                      onCheckedChange: () => {
                        check("Item 3");
                      },
                    }}
                  />
                  <Tree.Item
                    label="Item 4"
                    checkbox={{
                      checked: checked["Item 4"],
                      onCheckedChange: () => {
                        check("Item 4");
                      },
                    }}
                  />
                </Tree>
              </Tree.Item>
              <Tree.Item
                label="Google Drive"
                visual={DriveLogo}
                checkbox={{
                  checked: checked["Google Drive"],
                  onCheckedChange: () => {
                    check("Google Drive");
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
          <span className="s-text-xs s-text-muted-foreground">
            last updated Jan 6
          </span>
          <IconButton icon={CloudArrowDownIcon} size="xs" variant="outline" />
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
