import React, { useRef } from "react";
import TreeView, { INode } from "react-accessible-treeview";
import {
  FaCheckSquare,
  FaFolder,
  FaRegMinusSquare,
  FaRegSquare,
} from "react-icons/fa";
import { IoMdArrowDropdown, IoMdArrowDropright } from "react-icons/io";

import { GoogleDriveSelectedFolderType } from "@app/lib/connectors_api";
import { WorkspaceType } from "@app/types/user";

export default function GoogleDriveFoldersPicker(props: {
  folders: GoogleDriveSelectedFolderType[];
  owner: WorkspaceType;
  connectorId: string;
  onSelectedChange: (selected: string[]) => void;
}) {
  const treeView = useRef(null);
  const nodes = props.folders.map((el): INode => {
    return { isBranch: el.children.length > 0, ...el };
  });
  const selectedIds = props.folders.filter((f) => f.selected).map((f) => f.id);

  return (
    <>
      <div className="">
        <div className="flex flex-row" role="alert" aria-live="polite"></div>
        <div className="checkbox">
          <TreeView
            ref={treeView}
            data={nodes}
            className="p-3"
            aria-label="Checkbox tree"
            multiSelect
            propagateSelect={true}
            defaultSelectedIds={selectedIds}
            defaultExpandedIds={selectedIds
              .map((id): string[] => getParentsIds(id, props.folders))
              .flat()}
            togglableSelect
            propagateSelectUpwards={true}
            onNodeSelect={({ treeState }) => {
              console.log("treeState", treeState?.selectedIds);
              if (treeState?.selectedIds) {
                props.onSelectedChange(
                  Array.from(treeState.selectedIds).map((id) => id.toString())
                );
              }
            }}
            nodeRenderer={({
              element,
              isBranch,
              isExpanded,
              isSelected,
              isHalfSelected,
              getNodeProps,
              level,
              handleSelect,
              handleExpand,
            }) => {
              return (
                <div
                  {...getNodeProps({ onClick: handleExpand })}
                  style={{ marginLeft: 30 * (level - 1) }}
                  className="flex flex-row items-center leading-7 text-gray-900	"
                >
                  <div className="">
                    {isBranch && <ArrowIcon isOpen={isExpanded} />}
                    {!isBranch && (
                      <div className="opacity-0">
                        <ArrowIcon isOpen={false} />
                      </div>
                    )}
                  </div>
                  <div
                    className={`cursor-point  ${
                      isSelected || isHalfSelected
                        ? "text-blue-500"
                        : "text-gray-500"
                    }`}
                    onClick={(e) => {
                      handleSelect(e);
                      e.stopPropagation();
                    }}
                  >
                    <CheckBoxIcon
                      variant={
                        isHalfSelected ? "some" : isSelected ? "all" : "none"
                      }
                    />
                  </div>
                  <div className="ml-2 text-gray-600">
                    <FaFolder />
                  </div>
                  <div
                    className=" ml-1 cursor-pointer "
                    onClick={(e) => {
                      handleSelect(e);
                      e.stopPropagation();
                    }}
                  >
                    {element.name}
                  </div>
                </div>
              );
            }}
          />
        </div>
      </div>
    </>
  );
}

const ArrowIcon = ({ isOpen }: { isOpen: boolean }) => {
  if (!isOpen) {
    return <IoMdArrowDropright />;
  } else {
    return <IoMdArrowDropdown />;
  }
};

const CheckBoxIcon = ({ variant }: { variant: "all" | "none" | "some" }) => {
  switch (variant) {
    case "all":
      return <FaCheckSquare />;
    case "none":
      return <FaRegSquare />;
    case "some":
      return <FaRegMinusSquare />;
    default:
      throw new Error("Invalid variant");
  }
};

function getParentsIds(
  id: string,
  tree: GoogleDriveSelectedFolderType[]
): string[] {
  const parents = [];
  let currentId: string | null = id;
  while (currentId) {
    const currentNode = tree.find((el) => el.id === currentId);
    if (currentNode) {
      if (currentNode.parent) {
        parents.push(currentNode.parent);
      }
    }

    currentId = currentNode?.parent || null;
  }
  return parents;
}
