import React from "react";

import {
  ChatBubbleBottomCenterText,
  ChevronDown,
  ChevronRight,
  DocumentText,
  Folder,
  Square3Stack3D,
} from "@sparkle/icons/stroke";
import { classNames } from "@sparkle/lib/utils";

import { Checkbox, CheckboxProps } from "./Checkbox";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import Spinner from "./Spinner";

export interface TreeProps {
  children?: React.ReactNode;
  isLoading?: boolean;
}

export function Tree({ children, isLoading }: TreeProps) {
  return isLoading ? (
    <div className="s-py-2 s-pl-4">
      <Spinner size="sm" />
    </div>
  ) : (
    <div className="s-flex s-flex-col s-gap-1 s-overflow-hidden">
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

export interface TreeItemProps {
  label?: string;
  type?: "node" | "item" | "leaf";
  variant?: "file" | "folder" | "database" | "channel";
  visual?: React.ReactNode;
  checkbox?: CheckboxProps;
  onChevronClick?: () => void;
  collapsed?: boolean;
  className?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

Tree.Item = function ({
  label,
  type = "node",
  className = "",
  variant = "file",
  visual,
  checkbox,
  onChevronClick,
  collapsed,
  children,
  actions,
}: TreeItemProps) {
  return (
    <>
      <div
        className={classNames(
          className ? className : "",
          "s-flex s-flex-row s-items-center s-gap-4 s-py-1"
        )}
      >
        {type === "node" && (
          <IconButton
            icon={children && !collapsed ? ChevronDown : ChevronRight}
            size="sm"
            variant="secondary"
            onClick={onChevronClick}
          />
        )}
        {type === "leaf" && <div className="s-w-5"></div>}
        {checkbox && <Checkbox {...checkbox} />}

        <div className="s-flex s-w-full s-items-center s-gap-1.5 s-text-sm s-font-medium s-text-element-900">
          <div className="s-grid s-w-full s-grid-cols-[auto,1fr,auto] s-items-center s-gap-1.5 s-text-sm s-font-medium s-text-element-900">
            {visual ? (
              visual
            ) : (
              <Icon
                visual={visualTable[variant]}
                size="sm"
                className="s-flex-shrink-0 s-text-element-700"
              />
            )}

            <div className="s-truncate">{label}</div>
            {actions && <div className="s-inline-block s-pl-5">{actions}</div>}
          </div>
        </div>
      </div>
      {React.Children.count(children) > 0 && (
        <div className="s-pl-5">{!collapsed && children}</div>
      )}
    </>
  );
};
