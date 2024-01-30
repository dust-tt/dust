import type { SVGProps } from "react";
import * as React from "react";
const SvgClipboardCheck = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17.5 6 14 9.5l-2-2L10.5 9l3.5 3.5 5-5L17.5 6Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M17 22v-5h4.997L22 2H7v5c-.495 0-.99.002-1.485.004-1.172.004-2.344.008-3.515-.011V22h15ZM7 17h8v3H4V9h3v8ZM9 4h11l-.003 11H9V4Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgClipboardCheck;
