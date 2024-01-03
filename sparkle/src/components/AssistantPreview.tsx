import React from "react";

import { Avatar } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
import { Chip } from "@sparkle/components/Chip";
import { Dash, More, Play, Plus } from "@sparkle/icons/solid";

type AssistantPreviewVariant = "sm" | "md" | "lg" | "list";

interface AssistantPreviewProps {
  allowAddAction: boolean;
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

function getVariantContent(
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

const LargeVariantContent = ({ props }: { props: AssistantPreviewProps }) => {
  const {
    description,
    isAdded,
    allowAddAction,
    isUpdatingList,
    isWorkspace,
    name,
    onShowDetailsClick,
    onTestClick,
    onUpdate,
    pictureUrl,
    subtitle,
  } = props;

  const galleryChip = isAdded && (
    <div className="s-group">
      <Chip
        color="emerald"
        size="xs"
        label="Added"
        className="group-hover:s-hidden"
      />
      {allowAddAction && (
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
  );

  const addButton = !isAdded && allowAddAction && (
    <Button
      key="add"
      variant="tertiary"
      icon={Plus}
      disabled={isUpdatingList}
      size="xs"
      label={isWorkspace ? "Add to Workspace" : "Add"}
      onClick={() => onUpdate("added")}
    />
  );

  let testButton = null;
  if (onTestClick) {
    testButton = (
      <Button
        key="test"
        variant="tertiary"
        icon={Play}
        size="xs"
        label={"Test"}
        onClick={onTestClick}
      />
    );
  }

  const showAssistantButton = (
    <Button
      key="show_details"
      icon={More}
      label={"View Assistant"}
      labelVisible={false}
      size="xs"
      variant="tertiary"
      onClick={onShowDetailsClick}
    />
  );

  const buttonsToRender =
    ([addButton, testButton, showAssistantButton].filter(
      Boolean
    ) as JSX.Element[]) ?? [];

  return (
    <div className="s-flex s-flex-row s-gap-2 s-py-2">
      <Avatar visual={<img src={pictureUrl} alt="Agent Avatar" />} size="md" />
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
          {galleryChip}
          <Button.List isWrapping={true}>{buttonsToRender}</Button.List>
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
  // You can also use a function to get variant-specific styles or components
  const VariantContent = getVariantContent(props.variant, props);

  return <div>{VariantContent}</div>;
}
