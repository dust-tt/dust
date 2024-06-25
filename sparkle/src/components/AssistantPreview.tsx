import React, { SyntheticEvent, useState } from "react";

import { Button, CardButton, MoreIcon, PlayIcon } from "@sparkle/_index";
import { Avatar } from "@sparkle/components/Avatar";
import { classNames } from "@sparkle/lib/utils";

type AssistantPreviewVariant = "item" | "list" | "gallery" | "minimal";

interface BaseAssistantPreviewProps {
  variant: AssistantPreviewVariant;
  description: string;
  title: string;
  pictureUrl: string;
  subtitle?: string;
  onClick?: () => void;
}

type ItemVariantAssistantPreviewProps = BaseAssistantPreviewProps & {
  variant: "item";
  actions: React.ReactNode;
};

type ListVariantAssistantPreviewProps = BaseAssistantPreviewProps & {
  variant: "list";
};

type GalleryVariantAssistantPreviewProps = BaseAssistantPreviewProps & {
  variant: "gallery";
  renderActions?: (isHovered: boolean) => React.ReactNode;
  onPlayClick?: (e: SyntheticEvent) => void;
};

type MinimalVariantAssistantPreviewProps = BaseAssistantPreviewProps & {
  variant: "minimal";
  hasAction?: boolean;
  href?: string;
  onClick?: () => void;
  onActionClick?: () => void;
};

type AssistantPreviewProps =
  | ItemVariantAssistantPreviewProps
  | ListVariantAssistantPreviewProps
  | GalleryVariantAssistantPreviewProps
  | MinimalVariantAssistantPreviewProps;

const isBrowser = typeof window !== "undefined";

const breakpoints = {
  sm: 640, // Tailwind's default for `sm`
  md: 768, // Tailwind's default for `md`
  lg: 1024, // Tailwind's default for `lg`
  xl: 1280, // Tailwind's default for `xl`
  xxl: 1536, // Tailwind's default for `2xl`
};

const getWindowWidth = () => (isBrowser ? window.innerWidth : 0);

const titleClassNames = {
  base: "s-truncate s-font-medium s-text-element-900 s-w-full",
  item: "s-text-sm",
  list: "s-text-base",
  gallery: "s-text-lg",
  minimal: `s-overflow-hidden s-whitespace-nowrap ${
    getWindowWidth() <= breakpoints.sm
      ? "s-text-sm"
      : getWindowWidth() <= breakpoints.md
        ? "s-text-base"
        : ""
  }`,
};

const subtitleClassNames = {
  base: "s-font-normal s-text-element-700 s-truncate s-w-full",
  item: "s-text-xs",
  list: "s-text-sm",
  gallery: "s-text-sm",
  minimal: `s-overflow-hidden s-whitespace-nowrap ${
    getWindowWidth() <= breakpoints.sm
      ? "s-text-xs"
      : getWindowWidth() <= breakpoints.md
        ? "s-text-sm"
        : ""
  }`,
};

const descriptionClassNames = {
  base: "s-font-normal s-mb-1",
  item: "s-text-xs s-text-element-700 s-pl-1 s-line-clamp-3",
  list: "s-text-base s-text-element-800 s-line-clamp-3",
  gallery: "s-text-base s-text-element-800 s-line-clamp-3",
};

function renderVariantContent(
  props: AssistantPreviewProps & { isHovered: boolean }
) {
  switch (props.variant) {
    case "item":
      return <ItemVariantContent {...props} />;
    case "list":
      return <ListVariantContent {...props} />;
    case "gallery":
      return <GalleryVariantContent {...props} />;
    case "minimal":
      return <MinimalVariantContent {...props} />;
    default:
      return <></>;
  }
}

const ItemVariantContent = ({
  actions,
  description,
  title,
  pictureUrl,
  subtitle,
}: ItemVariantAssistantPreviewProps) => {
  return (
    <>
      <div className="s-flex s-items-center s-gap-2">
        <Avatar name={`Avatar of ${title}`} visual={pictureUrl} size="sm" />
        <div className="s-flex s-w-full s-min-w-0 s-flex-col s-items-start s-gap-2">
          <div className="s-flex s-w-full s-min-w-0 s-flex-row s-gap-3">
            <div className="s-flex s-w-full s-min-w-0 s-flex-col s-items-start s-gap-0">
              <div
                className={classNames(
                  titleClassNames["base"],
                  titleClassNames.item
                )}
              >
                @{title}
              </div>
              <div
                className={classNames(
                  subtitleClassNames["base"],
                  subtitleClassNames.item
                )}
              >
                By: {subtitle}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        className={classNames(
          descriptionClassNames["base"],
          descriptionClassNames.item
        )}
      >
        {description}
      </div>
      {actions}
    </>
  );
};

const ListVariantContent = ({
  description,
  title,
  pictureUrl,
  subtitle,
}: ListVariantAssistantPreviewProps) => {
  return (
    <div className="s-flex s-gap-2">
      <Avatar name={`Avatar of ${title}`} visual={pictureUrl} size="lg" />
      <div className="s-flex s-w-full s-min-w-0 s-flex-col s-items-start s-gap-2">
        <div className="s-flex s-w-full s-min-w-0 s-flex-row s-gap-3">
          <div className="s-flex s-w-full s-min-w-0 s-flex-col s-items-start s-gap-0">
            <div
              className={classNames(
                titleClassNames["base"],
                titleClassNames.list
              )}
            >
              @{title}
            </div>

            {subtitle && (
              <div
                className={classNames(
                  subtitleClassNames["base"],
                  subtitleClassNames.list
                )}
              >
                By: {subtitle}
              </div>
            )}
          </div>
        </div>
        <div
          className={classNames(
            descriptionClassNames["base"],
            descriptionClassNames.list
          )}
        >
          {description}
        </div>
      </div>
    </div>
  );
};

const GalleryVariantContent = ({
  renderActions,
  description,
  onPlayClick,
  title,
  pictureUrl,
  subtitle,
  isHovered,
}: GalleryVariantAssistantPreviewProps & { isHovered: boolean }) => {
  return (
    <div className="s-flex s-gap-2">
      <Avatar name={`Avatar of ${title}`} visual={pictureUrl} size="lg" />
      <div className="s-flex s-w-full s-min-w-0 s-flex-col s-items-start s-gap-2">
        <div className="s-flex s-w-full s-min-w-0 s-flex-row s-gap-3">
          <div className="s-flex s-w-full s-min-w-0 s-flex-col s-items-start s-gap-0">
            <div
              className={classNames(
                titleClassNames["base"],
                titleClassNames.gallery
              )}
            >
              @{title}
            </div>
            <div
              className={classNames(
                subtitleClassNames["base"],
                subtitleClassNames.gallery
              )}
            >
              By: {subtitle}
            </div>
          </div>
          {isHovered && onPlayClick && (
            <Button
              variant="primary"
              size="sm"
              label="Try"
              labelVisible={false}
              icon={PlayIcon}
              onClick={onPlayClick}
            />
          )}
        </div>
        {renderActions && renderActions(isHovered)}
        <div
          className={classNames(
            descriptionClassNames["base"],
            descriptionClassNames.gallery
          )}
        >
          {description}
        </div>
      </div>
    </div>
  );
};

const MinimalVariantContent = ({
  title,
  pictureUrl,
  subtitle,
  hasAction = true,
  onClick,
  onActionClick,
}: MinimalVariantAssistantPreviewProps) => {
  const actionButton = (
    <Button
      label=""
      icon={MoreIcon}
      variant="tertiary"
      size="sm"
      labelVisible={false}
      hasMagnifying={false}
      disabledTooltip={true}
      onClick={(e) => {
        e.stopPropagation();
        onActionClick?.();
      }}
    />
  );

  return (
    <>
      <div
        id="assistant-container"
        className="s-flex s-grow s-flex-row s-justify-between s-gap-2 s-overflow-hidden s-py-1"
        onClick={onClick}
      >
        <div
          id="preview"
          className="s-flex s-w-full s-min-w-0 s-flex-row s-items-center s-gap-2"
        >
          <div id="avatar-column" className="s-w-fit">
            <Avatar name={`Avatar of ${title}`} visual={pictureUrl} size="md" />
          </div>
          <div
            id="details-column"
            className="s-flex s-w-full s-min-w-0 s-flex-col s-items-start s-gap-0 s-overflow-hidden"
          >
            <div
              className={classNames(
                titleClassNames["base"],
                titleClassNames.minimal
              )}
            >
              @{title}
            </div>
            <div
              className={classNames(
                subtitleClassNames["base"],
                subtitleClassNames.minimal
              )}
            >
              By: {subtitle}
            </div>
          </div>
        </div>
        <div id="actions-column" className="s-flex s-w-fit s-shrink-0">
          {hasAction && actionButton}
        </div>
      </div>
    </>
  );
};

export function AssistantPreview(props: AssistantPreviewProps) {
  const { onClick, variant } = props;
  // State to manage the visibility of the play button
  const [isHovered, setIsHovered] = useState(false);

  return (
    <CardButton
      variant="tertiary"
      className={classNames("s-flex s-flex-col s-gap-2 s-border")}
      size={variant === "item" || variant === "minimal" ? "sm" : "lg"}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {renderVariantContent({ ...props, isHovered })}
    </CardButton>
  );
}
