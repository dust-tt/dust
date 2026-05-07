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
      d="M19 .465c.572 0 1.035.463 1.035 1.035v7c0 .572-.463 1.035-1.035 1.035h-4.502l5.233 5.234A1.035 1.035 0 0 1 19 16.535h-5.965V22.5a1.035 1.035 0 0 1-1.766.731l-7-7a1.03 1.03 0 0 1-.304-.731v-7c0-.572.463-1.035 1.035-1.035h4.502L4.269 2.23A1.035 1.035 0 0 1 5 .465zm-8.035 19.537v-3.467H7.498zm-4.93-5.537h10.467l-4.93-4.93H6.035zm6.393-7h5.537v-4.93H7.498z"
    />
  </svg>
);
export default SvgFramer;
