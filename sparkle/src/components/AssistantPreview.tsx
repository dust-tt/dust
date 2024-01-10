import React, { SyntheticEvent } from "react";

import { Avatar } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
import { Chip } from "@sparkle/components/Chip";
import {
  ChatBubbleBottomCenterText,
  Dash,
  More,
  Play,
  Plus,
} from "@sparkle/icons/solid";

type AssistantPreviewVariant = "sm" | "md" | "lg" | "list";

interface BaseAssistantPreviewProps {
  description: string;
  name: string;
  pictureUrl: string;
  variant: AssistantPreviewVariant;
}

type LargeVariantAssistantPreviewProps = BaseAssistantPreviewProps & {
  variant: "lg";

  allowAddAction?: boolean;
  allowRemoveAction?: boolean;
  isAdded: boolean;
  isUpdatingList: boolean;
  isWorkspace: boolean;
  subtitle: string;

  onShowDetailsClick?: () => void;
  onTestClick?: () => void;
  onUpdate: (action: "added" | "removed") => Promise<void> | void;
};

type SmallVariantAssistantPreviewProps = BaseAssistantPreviewProps & {
  variant: "sm";

  onClick: (e: SyntheticEvent) => void;
};

type AssistantPreviewProps =
  | SmallVariantAssistantPreviewProps
  | LargeVariantAssistantPreviewProps;

// Define defaultProps for the AssistantPreview component.
AssistantPreview.defaultProps = {
  allowAddAction: false,
  allowRemoveAction: false,
};

function renderVariantContent(props: AssistantPreviewProps) {
  switch (props.variant) {
    case "sm":
      return <SmallVariantContent {...props} />;
    case "lg":
      return <LargeVariantContent {...props} />;
    default:
      return <></>;
  }
}

const SmallVariantContent = (props: SmallVariantAssistantPreviewProps) => {
  const { description, name, onClick, pictureUrl } = props;

  return (
    <div className="s-flex s-flex-col s-py-2">
      <div className="s-flex s-flex-row s-gap-2">
        <Avatar
          visual={<img src={pictureUrl} alt={`Avatar of ${name}`} />}
          size="md"
        />
        <div className="s-flex s-flex-col s-gap-2">
          <div className="s-text-sm s-font-medium s-text-element-900">
            @{name}
          </div>
          <Button
            key="start"
            variant="tertiary"
            icon={ChatBubbleBottomCenterText}
            size="xs"
            label={"Start"}
            onClick={onClick}
          />
        </div>
      </div>
      <div className="s-py-1.5 s-text-sm s-font-normal s-text-element-700">
        {description}
      </div>
    </div>
  );
};

type GalleryChipProps = Pick<
  LargeVariantAssistantPreviewProps,
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
  LargeVariantAssistantPreviewProps,
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

const LargeVariantContent = (props: LargeVariantAssistantPreviewProps) => {
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

export function AssistantPreview(props: AssistantPreviewProps) {
  const VariantContent = renderVariantContent(props);

  return <div>{VariantContent}</div>;
}
