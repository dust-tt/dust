import React, { useState } from "react";

import { Button, PlayIcon } from "@sparkle/_index";
import { Avatar } from "@sparkle/components/Avatar";
import { classNames } from "@sparkle/lib/utils";

type AssistantPreviewVariant = "item" | "list" | "gallery";

interface BaseAssistantPreviewProps {
  variant: AssistantPreviewVariant;
  description: string;
  title: string;
  pictureUrl: string;
  subtitle: string;
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
};

type AssistantPreviewProps =
  | ItemVariantAssistantPreviewProps
  | ListVariantAssistantPreviewProps
  | GalleryVariantAssistantPreviewProps;

const titleClassNames = {
  base: "s-truncate s-font-medium s-text-element-900 s-w-full",
  item: "s-text-sm",
  list: "s-text-base",
  gallery: "s-text-lg",
};
const subtitleClassNames = {
  base: "s-font-normal s-text-element-700 s-truncate s-w-full",
  item: "s-text-xs",
  list: "s-text-sm",
  gallery: "s-text-sm",
};
const descriptionClassNames = {
  base: "s-font-normal s-mb-1",
  item: "s-text-xs s-text-element-700 s-pl-1 s-line-clamp-3 s-h-12",
  list: "s-text-base s-text-element-800",
  gallery: "s-text-base s-text-element-800",
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
    default:
      return <></>;
  }
}

const ItemVariantContent = (props: ItemVariantAssistantPreviewProps) => {
  const { actions, description, title, pictureUrl, subtitle } = props;

  return (
    <>
      <div className="s-flex s-gap-2">
        <Avatar
          visual={<img src={pictureUrl} alt={`Avatar of ${title}`} />}
          size="sm"
        />
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

const ListVariantContent = (props: ListVariantAssistantPreviewProps) => {
  const { description, title, pictureUrl, subtitle } = props;

  return (
    <div className="s-flex s-gap-2">
      <Avatar
        visual={<img src={pictureUrl} alt={`Avatar of ${title}`} />}
        size="md"
      />
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
            <div
              className={classNames(
                subtitleClassNames["base"],
                subtitleClassNames.list
              )}
            >
              By: {subtitle}
            </div>
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

const GalleryVariantContent = (
  props: GalleryVariantAssistantPreviewProps & { isHovered: boolean }
) => {
  const { renderActions, description, title, pictureUrl, subtitle, isHovered } =
    props;

  return (
    <div className="s-flex s-gap-2">
      <Avatar
        visual={<img src={pictureUrl} alt={`Avatar of ${title}`} />}
        size="md"
      />
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
          {isHovered && (
            <Button
              variant="primary"
              size="sm"
              label="Try"
              labelVisible={false}
              icon={PlayIcon}
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

export function AssistantPreview2(props: AssistantPreviewProps) {
  const { onClick, variant } = props;
  // State to manage the visibility of the play button
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={classNames(
        "s-flex s-flex-col s-gap-2 s-border s-border-structure-100/0 s-transition s-duration-200 hover:s-cursor-pointer hover:s-border-structure-100 hover:s-bg-structure-50",
        variant === "item" ? "s-rounded-2xl s-p-3" : " s-rounded-3xl s-p-4"
      )}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {renderVariantContent({ ...props, isHovered })}
    </div>
  );
}
