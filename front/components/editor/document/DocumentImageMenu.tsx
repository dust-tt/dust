import {
  DOCUMENT_IMAGE_NODE_NAME,
  IMAGE_SOURCE_ATTRIBUTE,
  parseImageWidth,
} from "@app/components/editor/document/DocumentImage";
import { useEditorLayoutVersion } from "@app/components/editor/document/useEditorLayoutVersion";
import {
  Button,
  HoveringBar,
  ReverseLeft,
  Slider,
  Trash01,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { Editor } from "@tiptap/core";
import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const MIN_IMAGE_WIDTH_PX = 64;
const MENU_INSET_PX = 8;

const isDocumentImage = (
  target: EventTarget | null
): target is HTMLImageElement =>
  target instanceof HTMLImageElement &&
  target.hasAttribute(IMAGE_SOURCE_ATTRIBUTE);

/** Keeps the editor's selection while a control is pressed. */
const keepSelection = (event: React.MouseEvent) => event.preventDefault();

const imagePosition = (editor: Editor, image: HTMLImageElement) => {
  if (!editor.view.dom.contains(image)) {
    return null;
  }
  const pos = editor.view.posAtDOM(image, 0);
  return editor.state.doc.nodeAt(pos)?.type.name === DOCUMENT_IMAGE_NODE_NAME
    ? pos
    : null;
};

interface DocumentImageMenuProps {
  editor: Editor;
}

/**
 * @cc [owner:tdraier,label:product] document-image-menu
 * In an editable document, hovering an image MUST show, at its top right, a menu with a width
 * slider, an action back to the original size once the image has a width, and an action to
 * remove it. Dragging the slider MUST preview the width and save it once, on release, so each
 * action is one undoable edit that changes only the hovered image. The menu MUST stay while the
 * pointer is on it or the slider is dragged, and hide otherwise.
 */
export const DocumentImageMenu = ({ editor }: DocumentImageMenuProps) => {
  const { t } = useLingui();
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [hovering, setHovering] = useState(false);
  const [draftWidth, setDraftWidth] = useState<number | null>(null);
  const [offset, setOffset] = useState<{ top: number; right: number } | null>(
    null
  );
  const layoutVersion = useEditorLayoutVersion(editor, containerRef);
  const resizing = draftWidth !== null;

  // While the slider is dragged, the menu stays on its image.
  useEffect(() => {
    if (resizing) {
      return;
    }
    const dom = editor.view.dom;
    const onOver = (event: MouseEvent) => {
      if (isDocumentImage(event.target)) {
        setImage(event.target);
        setHovering(true);
      }
    };
    const onOut = (event: MouseEvent) => {
      if (
        isDocumentImage(event.target) &&
        !(
          event.relatedTarget instanceof Node &&
          menuRef.current?.contains(event.relatedTarget)
        )
      ) {
        setHovering(false);
      }
    };
    dom.addEventListener("mouseover", onOver);
    dom.addEventListener("mouseout", onOut);
    return () => {
      dom.removeEventListener("mouseover", onOver);
      dom.removeEventListener("mouseout", onOut);
    };
  }, [editor, resizing]);

  // Frozen while the slider is dragged, so the slider does not move under the pointer as the
  // image resizes.
  useLayoutEffect(() => {
    if (resizing) {
      return;
    }
    const container = containerRef.current;
    if (!image?.isConnected || !container) {
      setOffset(null);
      return;
    }
    const imageRect = image.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setOffset({
      top: imageRect.top - containerRect.top + MENU_INSET_PX,
      right: containerRect.right - imageRect.right + MENU_INSET_PX,
    });
  }, [image, layoutVersion, resizing]);

  const pos = image && imagePosition(editor, image);
  const visible = pos !== null && offset !== null && (hovering || resizing);
  const width =
    pos !== null
      ? parseImageWidth(editor.state.doc.nodeAt(pos)?.attrs.width)
      : null;
  const maxWidth = Math.max(
    editor.view.dom.clientWidth,
    width ?? 0,
    MIN_IMAGE_WIDTH_PX
  );
  const sliderWidth =
    draftWidth ??
    width ??
    Math.min(
      maxWidth,
      Math.max(
        MIN_IMAGE_WIDTH_PX,
        Math.round(image?.getBoundingClientRect().width ?? 0)
      )
    );

  const setWidth = (nextWidth: number | null) => {
    setDraftWidth(null);
    if (pos === null) {
      return;
    }
    editor
      .chain()
      .command(({ tr }) => {
        tr.setNodeAttribute(pos, "width", nextWidth);
        return true;
      })
      .run();
    // The image is drawn again with its new width.
    const resized = editor.view.nodeDOM(pos);
    setImage(isDocumentImage(resized) ? resized : null);
  };

  const previewWidth = (nextWidth: number) => {
    setDraftWidth(nextWidth);
    if (image) {
      image.style.width = `${nextWidth}px`;
    }
  };

  const remove = () => {
    if (pos === null) {
      return;
    }
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + 1 })
      .run();
    setImage(null);
  };

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-10 print:hidden"
    >
      {visible && (
        <div
          ref={menuRef}
          role="toolbar"
          aria-label={t({
            message: "Image",
            context: "toolbar over a hovered image",
          })}
          className="pointer-events-auto absolute font-sans text-foreground antialiased"
          style={{ top: offset.top, right: offset.right }}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={(event) => setHovering(event.relatedTarget === image)}
        >
          <HoveringBar size="xs">
            <div className="w-28 px-2">
              <Slider
                min={MIN_IMAGE_WIDTH_PX}
                max={maxWidth}
                value={[sliderWidth]}
                onValueChange={([nextWidth]) => previewWidth(nextWidth)}
                onValueCommit={([nextWidth]) => setWidth(nextWidth)}
                ariaLabel={t`Image width`}
                showValueTooltip
                formatValue={(value) => t`${value} px`}
              />
            </div>
            {width !== null && (
              <Button
                size="xs"
                variant="ghost-secondary"
                icon={ReverseLeft}
                tooltip={t`Original size`}
                aria-label={t`Original size`}
                onMouseDown={keepSelection}
                onClick={() => setWidth(null)}
              />
            )}
            <HoveringBar.Separator />
            <Button
              size="xs"
              variant="ghost-secondary"
              icon={Trash01}
              tooltip={t`Remove image`}
              aria-label={t`Remove image`}
              onMouseDown={keepSelection}
              onClick={remove}
            />
          </HoveringBar>
        </div>
      )}
    </div>
  );
};
