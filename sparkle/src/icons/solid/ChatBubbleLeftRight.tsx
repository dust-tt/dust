import type { SVGProps } from "react";
import * as React from "react";
const SvgChatBubbleLeftRight = (props: SVGProps<SVGSVGElement>) => (
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
      fillRule="evenodd"
      d="M7.2 20a74.868 74.868 0 0 0 2-.848 34.066 34.066 0 0 0 2.395-1.167c.687.792 1.503 1.399 2.255 1.861.757.466 1.711.932 2.55 1.311 1.1.497 2 .843 2 .843v-2.513c3.15 0 5.6-2.571 5.6-5.743S21.493 8 18.4 8h-.526c-.632-3.417-3.559-6-7.074-6H7.2C3.224 2 0 5.306 0 9.385c0 4.078 3.224 7.384 7.2 7.384V20Zm11.2-2.513h-2v1.462a17.74 17.74 0 0 1-1.502-.806c-1.543-.95-2.898-2.278-2.898-4.4C12 11.629 13.66 10 15.6 10h2.8c1.94 0 3.6 1.628 3.6 3.744 0 2.129-1.615 3.743-3.6 3.743Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgChatBubbleLeftRight;
