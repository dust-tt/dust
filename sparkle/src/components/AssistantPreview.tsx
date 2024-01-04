import React from "react";

import { Avatar } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
import { Chip } from "@sparkle/components/Chip";
import { Dash, More, Play, Plus } from "@sparkle/icons/solid";

type AssistantPreviewVariant = "sm" | "md" | "lg" | "list";

interface AssistantPreviewProps {
  allowAddAction?: boolean;
  allowRemoveAction?: boolean;
  description: string;
  isAdded: boolean;
  isUpdatingList: boolean;
  isWorkspace: boolean;
  name: string;
  pictureUrl: string;
  subtitle: string;
  variant: AssistantPreviewVariant;

  // CTA's.
  onShowDetailsClick?: () => void;
  onTestClick?: () => void;
  onUpdate: (action: "added" | "removed") => Promise<void> | void;
}

// Define defaultProps for the AssistantPreview component.
AssistantPreview.defaultProps = {
  allowAddAction: false,
  allowRemoveAction: false,
};

function renderVariantContent(
  variant: AssistantPreviewVariant,
  props: AssistantPreviewProps
) {
  switch (variant) {
    case "sm":
      return <SmallVariantContent />;
    case "md":
      return <MediumVariantContent />;
    case "lg":
      return <LargeVariantContent props={props} />;
    case "list":
      return <ListVariantContent />;
    default:
      return <></>;
  }
}

// TODO:
const SmallVariantContent = () => {
  throw new Error("Not yet implemented!");
};

// TODO:
const MediumVariantContent = () => {
  throw new Error("Not yet implemented!");
};

type GalleryChipProps = Pick<
  AssistantPreviewProps,
  | "allowAddAction"
  | "allowRemoveAction"
  | "isAdded"
  | "isUpdatingList"
  | "onUpdate"
>;

const GalleryChip = ({
  allowAddAction,
  allowRemoveAction,
  isAdded,
  isUpdatingList,
  onUpdate,
}: GalleryChipProps) => {
  if (!isAdded || !allowAddAction) return null;

  return (
    allowAddAction && (
      <div className="s-group">
        <Chip
          color="emerald"
          size="xs"
          label="Added"
          className={allowRemoveAction ? "group-hover:s-hidden" : ""}
        />
        {allowRemoveAction && (
          <div className="s-hidden group-hover:s-block">
            <Button.List isWrapping={true}>
              <Button
                key="remove"
                variant="tertiary"
                icon={Dash}
                disabled={isUpdatingList}
                size="xs"
                label={"Remove"}
                onClick={() => onUpdate("removed")}
              />
            </Button.List>
          </div>
        )}
      </div>
    )
  );
};

type ButtonsGroupProps = Pick<
  AssistantPreviewProps,
  | "allowAddAction"
  | "isAdded"
  | "isUpdatingList"
  | "isWorkspace"
  | "onShowDetailsClick"
  | "onTestClick"
  | "onUpdate"
>;

const ButtonsGroup = ({
  allowAddAction,
  isAdded,
  isUpdatingList,
  isWorkspace,
  onShowDetailsClick,
  onTestClick,
  onUpdate,
}: ButtonsGroupProps) => {
  return (
    <Button.List isWrapping={true}>
      {!isAdded && allowAddAction && (
        <Button
          key="add"
          variant="tertiary"
          icon={Plus}
          disabled={isUpdatingList}
          size="xs"
          label={isWorkspace ? "Add to Workspace" : "Add"}
          onClick={() => onUpdate("added")}
        />
      )}
      {onTestClick && (
        <Button
          key="test"
          variant="tertiary"
          icon={Play}
          size="xs"
          label={"Test"}
          onClick={onTestClick}
        />
      )}
      {onShowDetailsClick && (
        <Button
          key="show_details"
          icon={More}
          label={"View Assistant"}
          labelVisible={false}
          size="xs"
          variant="tertiary"
          onClick={onShowDetailsClick}
        />
      )}
    </Button.List>
  );
};

const LargeVariantContent = ({ props }: { props: AssistantPreviewProps }) => {
  const {
    allowAddAction,
    allowRemoveAction,
    description,
    isAdded,
    isUpdatingList,
    isWorkspace,
    name,
    onShowDetailsClick,
    onTestClick,
    onUpdate,
    pictureUrl,
    subtitle,
  } = props;

  return (
    <div className="s-flex s-flex-row s-gap-2 s-py-2">
      <Avatar
        visual={<img src={pictureUrl} alt={`Avatar of ${name}`} />}
        size="md"
      />
      <div className="s-flex s-flex-col s-gap-2">
        <div>
          <div className="s-text-sm s-font-medium s-text-element-900">
            @{name}
          </div>
          <div className="s-text-sm s-font-normal s-text-element-700">
            {subtitle}
          </div>
        </div>
        <div className="s-flex s-flex-row s-gap-2">
          <GalleryChip
            allowAddAction={allowAddAction}
            allowRemoveAction={allowRemoveAction}
            isAdded={isAdded}
            isUpdatingList={isUpdatingList}
            onUpdate={onUpdate}
          />
          <ButtonsGroup
            allowAddAction={allowAddAction}
            isAdded={isAdded}
            isUpdatingList={isUpdatingList}
            isWorkspace={isWorkspace}
            onShowDetailsClick={onShowDetailsClick}
            onTestClick={onTestClick}
            onUpdate={onUpdate}
          />
        </div>
        <div className="s-text-sm s-font-normal s-text-element-800">
          {description}
        </div>
      </div>
    </div>
  );
};

// TODO:
const ListVariantContent = () => {
  throw new Error("Not yet implemented!");
};

export function AssistantPreview(props: AssistantPreviewProps) {
  const VariantContent = renderVariantContent(props.variant, props);

  return <div>{VariantContent}</div>;
}
