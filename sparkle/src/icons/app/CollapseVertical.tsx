import type { SVGProps } from "react";
import * as React from "react";

const SvgCollapseVertical = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#1C222D"
      d="M13.5 5.5 15 4l2 2-5 5-5-5 2-2 1.5 1.5V1h3zM17 18l-2 2-1.5-1.5V23h-3v-4.5L9 20l-2-2 5-5z"
    />
  </svg>
);
export default SvgCollapseVertical;
