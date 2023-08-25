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
      d="M14.5 9.5 18 6l1.5 1.5-5 5L11 9l1.5-1.5 2 2Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M17 21v-4h3.99c.558 0 1.007-.451 1.007-1.008L22 3.008C22 2.45 21.549 2 20.992 2H8.008C7.45 2 7 2.451 7 3.007V7H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1Zm-8.993-4H15v3H4V9h3v6.992C7 16.552 7.45 17 8.007 17ZM20 4l-.003 11H9V4h11Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgClipboardCheck;
