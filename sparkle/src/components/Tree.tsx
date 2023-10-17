import React from "react";

import {
  ChatBubbleBottomCenterText,
  ChevronDown,
  ChevronRight,
  DocumentText,
  FolderOpen,
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
    <div className="s-flex s-flex-col s-gap-1">{children}</div>
  );
}

const visualTable = {
  file: DocumentText,
  folder: FolderOpen,
  database: Square3Stack3D,
  channel: ChatBubbleBottomCenterText,
};

export interface TreeItemProps {
  label?: string;
  type?: "node" | "item" | "leaf";
  variant?: "file" | "folder" | "database" | "channel";
  checkbox?: CheckboxProps;
  onChevronClick?: () => void;
  collapsed?: boolean;
  className?: string;
  children?: React.ReactNode;
}

Tree.Item = function ({
  label,
  type = "node",
  className = "",
  variant = "file",
  checkbox,
  onChevronClick,
  collapsed,
  children,
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

        <div className="s-flex s-items-center s-gap-1.5 s-text-sm s-font-medium s-text-element-900">
          <Icon
            visual={visualTable[variant]}
            size="sm"
            className="s-text-element-700"
          />
          {label}
        </div>
      </div>
      {React.Children.count(children) > 0 && (
        <div className="s-flex s-pl-5">{!collapsed && children}</div>
      )}
    </>
  );
};
