import type { SVGProps } from "react";
import * as React from "react";

const SvgActivity = (props: SVGProps<SVGSVGElement>) => (
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
      d="M9 1.965c.445 0 .84.285.981.708L15 17.729l2.019-6.056.063-.152c.176-.338.528-.556.918-.556h4a1.035 1.035 0 0 1 0 2.07h-3.255l-2.764 8.292a1.035 1.035 0 0 1-1.962 0L9 6.271l-2.019 6.056c-.14.423-.535.708-.981.708H2a1.035 1.035 0 0 1 0-2.07h3.255l2.764-8.292.063-.152c.176-.338.528-.556.918-.556"
    />
  </svg>
);
export default SvgActivity;
