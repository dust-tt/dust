import React, { ComponentType, useState } from "react";

import {
  ChatBubbleBottomCenterText,
  DocumentText,
  Folder,
  Square3Stack3D,
} from "@sparkle/icons/stroke";
import { ChevronDownIcon, ChevronRightIcon, Spinner } from "@sparkle/index";
import { classNames } from "@sparkle/lib/utils";

import { Checkbox, CheckboxProps } from "./Checkbox";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";

export interface TreeProps {
  children?: React.ReactNode;
  isBoxed?: boolean;
  isLoading?: boolean;
}

export function Tree({ children, isLoading, isBoxed = false }: TreeProps) {
  return isLoading ? (
    <div className="s-py-2 s-pl-4">
      <Spinner size="xs" variant="dark" />
    </div>
  ) : (
    <div
      className={classNames(
        "s-flex s-flex-col s-gap-1 s-overflow-hidden",
        isBoxed
          ? "s- s-rounded-xl s-border s-border-structure-200 s-bg-structure-50 s-p-4"
          : ""
      )}
    >
      {children}
    </div>
  );
}

const visualTable = {
  file: DocumentText,
  folder: Folder,
  database: Square3Stack3D,
  channel: ChatBubbleBottomCenterText,
};

interface TreeItemProps {
  label?: string;
  type?: "node" | "item" | "leaf";
  variant?: "file" | "folder" | "database" | "channel";
  size?: "sm" | "md";
  visual?: React.ReactNode;
  checkbox?: CheckboxProps;
  onChevronClick?: () => void;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
  actions?: React.ReactNode;
  areActionsFading?: boolean;
}

export interface TreeItemPropsWithChildren extends TreeItemProps {
  renderTreeItems?: never;
  children?: React.ReactNode;
}

export interface TreeItemPropsWithRender extends TreeItemProps {
  renderTreeItems: () => React.ReactNode;
  children?: never;
}

Tree.Item = function ({
  label,
  type = "node",
  className = "",
  variant = "file",
  size = "sm",
  visual,
  checkbox,
  onChevronClick,
  collapsed,
  defaultCollapsed,
  actions,
  areActionsFading = true,
  renderTreeItems,
  children,
}: TreeItemPropsWithChildren | TreeItemPropsWithRender) {
  const [collapsedState, setCollapsedState] = useState<boolean>(
    defaultCollapsed ?? true
  );

  const isControlledCollapse = collapsed !== undefined;

  const effectiveCollapsed = isControlledCollapse ? collapsed : collapsedState;
  const effectiveOnChevronClick = isControlledCollapse
    ? onChevronClick
    : () => setCollapsedState(!collapsedState);

  const getChildren = () => {
    if (effectiveCollapsed) {
      return [];
    }

    return typeof renderTreeItems === "function" ? renderTreeItems() : children;
  };

  const childrenToRender = getChildren();

  return (
    <>
      <div
        className={classNames(
          className ? className : "",
          "s-group s-flex s-cursor-default s-flex-row s-items-center s-gap-4",
          size === "sm" ? "s-py-1" : "s-py-2"
        )}
      >
        {type === "node" && (
          <IconButton
            icon={
              childrenToRender && !effectiveCollapsed
                ? ChevronDownIcon
                : ChevronRightIcon
            }
            size="sm"
            variant="secondary"
            onClick={effectiveOnChevronClick}
          />
        )}
        {type === "leaf" && <div className="s-w-5"></div>}
        {checkbox && <Checkbox {...checkbox} />}

        <div className="s-flex s-w-full s-items-center">
          <div
            className={classNames(
              "s-grid s-w-full s-grid-cols-[auto,1fr,auto] s-items-center",
              size === "sm" ? "s-gap-1.5" : "s-gap-2"
            )}
          >
            {visual ? (
              visual
            ) : (
              <Icon
                visual={visualTable[variant]}
                size="sm"
                className="s-flex-shrink-0 s-text-element-700"
              />
            )}

            <div
              className={classNames(
                "s-truncate s-font-medium s-text-element-900",
                size === "sm" ? "s-text-sm" : "s-text-base"
              )}
            >
              {label}
            </div>
            {actions && (
              <div
                className={classNames(
                  "s-inline-block s-pl-5",
                  areActionsFading
                    ? "s-transform s-opacity-0 s-duration-300 group-hover:s-opacity-100"
                    : ""
                )}
              >
                {actions}
              </div>
            )}
          </div>
        </div>
      </div>
      {React.Children.count(childrenToRender) > 0 && (
        <div className="s-pl-5">{childrenToRender}</div>
      )}
    </>
  );
};
