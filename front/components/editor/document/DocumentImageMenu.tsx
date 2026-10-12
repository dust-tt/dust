import {
  DOCUMENT_IMAGE_NODE_NAME,
  IMAGE_SOURCE_ATTRIBUTE,
  parseImageWidth,
} from "@app/components/editor/document/DocumentImage";
import { useEditorLayoutVersion } from "@app/components/editor/document/useEditorLayoutVersion";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  HoveringBar,
  Maximize01,
  Trash01,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { Editor } from "@tiptap/core";
import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const ORIGINAL_SIZE = "original";

const IMAGE_SIZES: { value: string; label: MessageDescriptor }[] = [
  { value: "240", label: msg({ message: "Small", context: "image size" }) },
  { value: "400", label: msg({ message: "Medium", context: "image size" }) },
  { value: "560", label: msg({ message: "Large", context: "image size" }) },
  { value: ORIGINAL_SIZE, label: msg`Original size` },
];

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
 * In an editable document, hovering an image MUST show, at its top right, a menu to resize it to
 * a preset width or back to its original size, and to remove it. Each action MUST change only the
 * hovered image, as one undoable edit. The menu MUST stay while the pointer moves onto it or its
 * size list is open, and hide otherwise.
 */
export const DocumentImageMenu = ({ editor }: DocumentImageMenuProps) => {
  const { t } = useLingui();
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [hovering, setHovering] = useState(false);
  const [sizesOpen, setSizesOpen] = useState(false);
  const [offset, setOffset] = useState<{ top: number; right: number } | null>(
    null
  );
  const layoutVersion = useEditorLayoutVersion(editor, containerRef);

  // While the size list is open, the menu stays on its image.
  useEffect(() => {
    if (sizesOpen) {
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
  }, [editor, sizesOpen]);

  useLayoutEffect(() => {
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
  }, [image, layoutVersion]);

  const pos = image && imagePosition(editor, image);
  const visible = pos !== null && offset !== null && (hovering || sizesOpen);
  const width =
    pos !== null
      ? parseImageWidth(editor.state.doc.nodeAt(pos)?.attrs.width)
      : null;

  const resize = (value: string) => {
    if (pos === null) {
      return;
    }
    editor
      .chain()
      .command(({ tr }) => {
        tr.setNodeAttribute(
          pos,
          "width",
          value === ORIGINAL_SIZE ? null : Number(value)
        );
        return true;
      })
      .run();
    // The image is drawn again with its new width.
    const resized = editor.view.nodeDOM(pos);
    setImage(isDocumentImage(resized) ? resized : null);
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
            <DropdownMenu
              modal={false}
              open={sizesOpen}
              onOpenChange={(open) => {
                setSizesOpen(open);
                // The list covered the image: the next pointer move shows the menu again.
                setHovering(open);
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  size="xs"
                  variant="ghost-secondary"
                  icon={Maximize01}
                  tooltip={t`Resize image`}
                  aria-label={t`Resize image`}
                  isSelect
                  onMouseDown={keepSelection}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" mountPortal={false}>
                <DropdownMenuRadioGroup
                  value={width === null ? ORIGINAL_SIZE : String(width)}
                  onValueChange={resize}
                >
                  {IMAGE_SIZES.map(({ value, label }) => (
                    <DropdownMenuRadioItem
                      key={value}
                      value={value}
                      label={t(label)}
                    />
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
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
