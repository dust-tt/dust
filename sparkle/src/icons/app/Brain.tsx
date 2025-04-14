import type { SVGProps } from "react";
import * as React from "react";
const SvgBrain = (props: SVGProps<SVGSVGElement>) => (
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
      d="M8.5 2a3.5 3.5 0 0 0-3.46 4.03A3.5 3.5 0 0 0 3.05 12a3.5 3.5 0 0 0 .963 5.67A4 4 0 0 0 11 20.646V3.05A3.49 3.49 0 0 0 8.501 2ZM13 3.05v17.596a4 4 0 0 0 6.986-2.977A3.5 3.5 0 0 0 20.95 12a3.5 3.5 0 0 0-1.99-5.97A3.5 3.5 0 0 0 13 3.05Z"
    />
  </svg>
);
export default SvgBrain;
