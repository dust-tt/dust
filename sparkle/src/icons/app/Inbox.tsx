import type { SVGProps } from "react";
import * as React from "react";
const SvgInbox = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M22 17.5 12 23 2 17.5V15l10 5.5L22 15v2.5Z" />
    <path fill="currentColor" d="m22 13-10 5.5L2 13v-2.5L12 16l10-5.5V13Z" />
    <path fill="currentColor" d="M22 6.5v2L12 14 2 8.5v-2L12 1l10 5.5Z" />
  </svg>
);
export default SvgInbox;
