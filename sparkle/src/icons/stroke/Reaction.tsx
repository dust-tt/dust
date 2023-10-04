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
      d="M14 2.2c-.646-.131-1.315-.2-2-.2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10c0-.685-.069-1.354-.2-2h-2.052A8 8 0 1 1 14 4.252V2.2Z"
    />
    <path
      fill="currentColor"
      d="M11 17a4 4 0 0 0 4-4H7a4 4 0 0 0 4 4ZM7 11a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM13.5 9.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z"
    />
  </svg>
);
export default SvgReaction;
