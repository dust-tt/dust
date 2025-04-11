import type { SVGProps } from "react";
import * as React from "react";
const SvgCommunity = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="M21 21H3a1 1 0 0 1-1-1v-7.513a1 1 0 0 1 .343-.754L6 8.544V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1ZM9 19h3v-6.058L8 9.454l-4 3.488V19h3v-4h2v4Zm5 0h6V5H8v2.127c.234 0 .469.082.657.247l5 4.359a1 1 0 0 1 .343.754V19Zm2-8h2v2h-2v-2Zm0 4h2v2h-2v-2Zm0-8h2v2h-2V7Zm-4 0h2v2h-2V7Z"
    />
  </svg>
);
export default SvgCommunity;
