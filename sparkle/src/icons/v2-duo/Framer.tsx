import type { SVGProps } from "react";
import * as React from "react";

const SvgFramer = (props: SVGProps<SVGSVGElement>) => (
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
      d="M4.269 14.769a1.034 1.034 0 0 1 1.463 0l5.233 5.233V15.5a1.035 1.035 0 0 1 2.07 0v7a1.035 1.035 0 0 1-1.766.731l-7-7a1.034 1.034 0 0 1 0-1.462"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M19 .465c.572 0 1.035.463 1.035 1.035v7c0 .572-.463 1.035-1.035 1.035h-4.502l5.233 5.234A1.035 1.035 0 0 1 19 16.535H5A1.035 1.035 0 0 1 3.965 15.5v-7c0-.572.463-1.035 1.035-1.035h4.502L4.269 2.23A1.035 1.035 0 0 1 5 .465zm-12.965 14h10.467l-4.93-4.93H6.035zm6.393-7h5.537v-4.93H7.498z"
    />
  </svg>
);
export default SvgFramer;
