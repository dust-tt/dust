import cx from "classnames";
import React, { useRef, useState } from "react";
import TreeView, { INode } from "react-accessible-treeview";
import { FaCheckSquare, FaMinusSquare, FaSquare } from "react-icons/fa";
import { IoMdArrowDropright } from "react-icons/io";

import { GoogleDriveSelectedFolderType } from "@app/lib/connectors_api";
import { WorkspaceType } from "@app/types/user";

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

function MultiSelectCheckboxAsync(props: {
  folders: GoogleDriveSelectedFolderType[];
  owner: WorkspaceType;
  connectorId: string;
  onSelectedChange: (selected: string[]) => void;
}) {
  const loadedAlertElement = useRef(null);
  const treeView = useRef(null);
  const [data, setData] = useState(
    props.folders.map((el): INode => {
      return { isBranch: el.children.length > 0, ...el };
    })
  );
  const selectedIds = props.folders.filter((f) => f.selected).map((f) => f.id);

  console.log("selectedIds", selectedIds);

  return (
    <>
      <div>
        <div
          className="flex flex-row"
          ref={loadedAlertElement}
          role="alert"
          aria-live="polite"
        ></div>
        <div className="checkbox">
          <TreeView
            ref={treeView}
            data={data}
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
                  style={{ marginLeft: 40 * (level - 1) }}
                  className="flex flex-row items-center"
                >
                  {isBranch && <ArrowIcon isOpen={isExpanded} />}
                  {!isBranch && <ArrowIcon isOpen={false} />}
                  <CheckBoxIcon
                    className="checkbox-icon"
                    onClick={(e) => {
                      handleSelect(e);
                      e.stopPropagation();
                    }}
                    variant={
                      isHalfSelected ? "some" : isSelected ? "all" : "none"
                    }
                  />
                  <span className="name">{element.name}</span>
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
  const baseClass = "arrow";
  const classes = cx(
    baseClass,
    { [`${baseClass}--closed`]: !isOpen },
    { [`${baseClass}--open`]: isOpen }
  );
  return <IoMdArrowDropright className={classes} />;
};

const CheckBoxIcon = ({ variant, ...rest }) => {
  switch (variant) {
    case "all":
      return <FaCheckSquare {...rest} />;
    case "none":
      return <FaSquare {...rest} />;
    case "some":
      return <FaMinusSquare {...rest} />;
    default:
      return null;
  }
};

export default MultiSelectCheckboxAsync;
