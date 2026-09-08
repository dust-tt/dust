import type { SVGProps } from "react";
import * as React from "react";

const SvgMonday = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#F62B54"
      d="M2.986 19.39a3 3 0 0 1-2.612-1.516 2.9 2.9 0 0 1 .082-2.984l5.378-8.446A3 3 0 0 1 8.49 5.001a3 3 0 0 1 2.57 1.584 2.9 2.9 0 0 1-.163 2.98L5.522 18.01a3 3 0 0 1-2.536 1.38"
    />
    <path
      fill="#FC0"
      d="M12.211 19.389a2.99 2.99 0 0 1-2.607-1.512 2.89 2.89 0 0 1 .082-2.975l5.369-8.427A3 3 0 0 1 17.712 5a2.99 2.99 0 0 1 2.587 1.593 2.89 2.89 0 0 1-.194 2.993l-5.367 8.427a3 3 0 0 1-2.527 1.375"
    />
    <path
      fill="#00CA72"
      d="M21.23 19.46c1.53 0 2.77-1.214 2.77-2.711s-1.24-2.711-2.77-2.711c-1.528 0-2.768 1.213-2.768 2.71 0 1.498 1.24 2.712 2.769 2.712"
    />
  </svg>
);
export default SvgMonday;
