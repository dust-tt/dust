import type { SVGProps } from "react";
import * as React from "react";
const SvgChatBubbleThought = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="M6 11c0-.825.675-1.5 1.5-1.5S9 10.175 9 11s-.675 1.5-1.5 1.5S6 11.825 6 11ZM15 11c0-.825.675-1.5 1.5-1.5s1.5.675 1.5 1.5-.675 1.5-1.5 1.5S15 11.825 15 11ZM10.5 11c0-.825.675-1.5 1.5-1.5s1.5.675 1.5 1.5-.675 1.5-1.5 1.5-1.5-.675-1.5-1.5Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M14 3h-4a8 8 0 0 0-8 8c0 6.5 7 9.5 12 11.5V19a8 8 0 1 0 0-16Zm0 14h-2v2.48C6.462 16.966 4 14.61 4 11a6 6 0 0 1 6-6h4a6 6 0 0 1 0 12Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgChatBubbleThought;
