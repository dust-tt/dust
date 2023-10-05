import type { SVGProps } from "react";
import * as React from "react";
const SvgReaction = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M19 0h2v3h3v2h-3v3h-2V5h-3V3h3V0Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M12 22c5.523 0 10-4.477 10-10 0-1.045-.16-2.053-.458-3H18a3 3 0 0 0-3-3V2.458A9.996 9.996 0 0 0 12 2C6.477 2 2 6.477 2 12s4.477 10 10 10ZM7 11a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm8 2a4 4 0 0 1-8 0h8Zm-1.5-3.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgReaction;
