// import './MentionList.scss'

import {
  Avatar,
} from "@dust-tt/sparkle";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react'

import { classNames } from "@app/lib/utils";

export const MentionList = forwardRef(function mentionList(props, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = index => {
    const item = props.items[index]
    console.log('>> item:', item);

    if (item) {
      props.command({ id: item.name })
    }
  }

  const upHandler = () => {
    setSelectedIndex(((selectedIndex + props.items.length) - 1) % props.items.length)
  }

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => setSelectedIndex(0), [props.items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        upHandler()
        return true
      }

      if (event.key === 'ArrowDown') {
        downHandler()
        return true
      }

      if (event.key === 'Enter') {
        enterHandler()
        return true
      }

      return false
    },
  }))

  return (
    <div className="overflow-y-auto rounded-xl border border-structure-100 bg-white shadow-xl flex flex-col gap-y-1 px-3 py-2">
      {props.items.length
        ? props.items.map((item, index) => (
          <><div className="flex flex-initial items-center gap-x-2 py-1">
         <Avatar size="xs" visual={item.pictureUrl} /><button
            className={classNames(
              "flex-initial text-sm font-semibold",
              index === selectedIndex ? "text-action-500" : "text-element-900"
            )}
            key={index}
            onClick={() => selectItem(index)}
          >
            {item.name}
          </button>
        </div>

          </>
          // <><Avatar size="xs" visual={item.pictureUrl} /><button
          //   className={classNames(
          //     "flex-initial text-sm font-semibold",
          //     index === selectedIndex ? "text-action-500" : "text-element-900"
          //   )}
          //   key={index}
          //   onClick={() => selectItem(index)}
          // >
          //   {item}
          // </button></>
        ))
        : <div className="item">No result</div>
      }
    </div>
  )
})