import type { SVGProps } from "react";
import * as React from "react";

const SvgExpandVertical = (props: SVGProps<SVGSVGElement>) => (
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
      d="M13.5 18.5 15 17l2 2-5 5-5-5 2-2 1.5 1.5V14h3zM17 5l-2 2-1.5-1.5V10h-3V5.5L9 7 7 5l5-5z"
    />
  </svg>
);
export default SvgExpandVertical;
