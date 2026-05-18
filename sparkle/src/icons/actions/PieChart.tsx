import type { SVGProps } from "react";
import * as React from "react";

const SvgPieChart = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 32 32"
    {...props}
  >
    <path
      fill="currentColor"
      d="M14.6665 2.7323V17.3332H29.2673C28.5984 24.0709 22.9136 29.3332 15.9998 29.3332C8.63604 29.3636 2.6665 23.3636 2.6665 15.9998C2.6665 9.086 7.92874 3.40126 14.6665 2.7323ZM17.3332 0.723633C24.7378 1.36145 30.6382 7.26184 31.276 14.6665H17.3332V0.723633Z"
    />
  </svg>
);
export default SvgPieChart;
