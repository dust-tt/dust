import { Avatar } from "@dust-tt/sparkle";
import type { EditorSuggestion } from "@extension/components/input_bar/editor/suggestion";
import { classNames } from "@extension/lib/utils";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";

interface MentionListProps {
  command: any;
  items: EditorSuggestion[];
  query: string;
}

export const MentionList = forwardRef(function MentionList(
  props: MentionListProps,
  ref
) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];

    if (item) {
      props.command({ id: item.id, label: item.label });
    }
  };

  const upHandler = () => {
    setSelectedIndex(
      (selectedIndex + props.items.length - 1) % props.items.length
    );
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  const tabHandler = () => {
    enterHandler();
  };

  // Handler that selects the item if the current query matches its label exactly.
  const selectItemOnExactMatch = () => {
    const { query, items } = props;

    // Check if items are defined and not empty, and get the current selected item.
    const currentSelectedItem = items?.[selectedIndex];

    // Check if a selected item exists and if the query matches its label exactly.
    if (currentSelectedItem && query === currentSelectedItem.label) {
      selectItem(selectedIndex);
      // Indicate that the default action of the Space key should be prevented
      return true;
    }

    // Allow the default Space key action when there's no exact match or items are undefined
    return false;
  };

  const spaceHandler = () => {
    return selectItemOnExactMatch();
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      switch (event.key) {
        case "ArrowUp":
          upHandler();
          return true;
        case "ArrowDown":
          downHandler();
          return true;
        case "Enter":
          enterHandler();
          return true;
        case "Tab":
          tabHandler();
          return true;
        case " ":
          if (spaceHandler()) {
            event.preventDefault();
          }
          break;

        default:
          return false;
      }
    },
  }));

  return (
    <div
      className={classNames(
        "flex flex-col gap-y-1 overflow-y-auto rounded-xl border px-3 py-2 shadow-xl",
        "border-structure-100 dark:border-structure-100-night",
        "bg-white dark:bg-slate-950 dark:text-slate-50"
      )}
    >
      {props.items.length ? (
        props.items.map((item, index) => (
          <div
            className="flex flex-initial items-center gap-x-2 py-1"
            key={index}
          >
            <Avatar size="xs" visual={item.pictureUrl} />
            <button
              className={classNames(
                "flex-initial text-sm font-semibold",
                index === selectedIndex
                  ? "text-action-500 dark:text-action-500-night"
                  : "text-element-900 dark:text-element-900-night"
              )}
              key={index}
              onClick={() => selectItem(index)}
            >
              {item.label}
            </button>
          </div>
        ))
      ) : (
        <div>No result</div>
      )}
    </div>
  );
});
