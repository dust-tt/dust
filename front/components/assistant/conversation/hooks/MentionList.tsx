import { Avatar } from "@dust-tt/sparkle";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";

import { EditorSuggestion } from "@app/components/assistant/conversation/hooks/suggestion";
import { classNames } from "@app/lib/utils";

interface MentionListProps {
  command: any;
  items: EditorSuggestion[];
}

export const MentionList = forwardRef(function mentionList(
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

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: { key: string } }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }

      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }

      if (event.key === "Enter") {
        enterHandler();
        return true;
      }

      return false;
    },
  }));

  return (
    <div className="flex flex-col gap-y-1 overflow-y-auto rounded-xl border border-structure-100 bg-white px-3 py-2 shadow-xl">
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
                index === selectedIndex ? "text-action-500" : "text-element-900"
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
