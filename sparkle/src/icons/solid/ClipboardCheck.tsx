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
      d="M11.838 17.016C10.225 17.008 8.612 17 7 17V2h15l-.003 14.992c-3.384.057-6.772.04-10.159.024ZM19.5 14.5l.002-10H9.5v10h10Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="M17 19v3H2V6.992c.91.016 1.354.014 1.968.01L5 7v12h12Z"
    />
  </svg>
);
export default SvgClipboardCheck;
