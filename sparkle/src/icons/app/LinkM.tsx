import type { SVGProps } from "react";
import * as React from "react";
const SvgLinkM = (props: SVGProps<SVGSVGElement>) => (
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
      d="m17.657 14.828-1.415-1.414L17.657 12A4 4 0 1 0 12 6.343l-1.414 1.414L9.17 6.343l1.415-1.414a6 6 0 0 1 8.485 8.485l-1.414 1.414Zm-2.829 2.829-1.414 1.414a6 6 0 0 1-8.485-8.485l1.414-1.414 1.414 1.414L6.343 12A4 4 0 0 0 12 17.657l1.414-1.414 1.414 1.414ZM14.5 7.5l2 2-7 7-2-2 7-7Z"
    />
  </svg>
);
export default SvgLinkM;
