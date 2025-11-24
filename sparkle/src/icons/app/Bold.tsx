import type { SVGProps } from "react";
import * as React from "react";
const SvgBold = (props: SVGProps<SVGSVGElement>) => (
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
      d="M6 20V4h5.69c3.7 0 5.668 1.33 5.668 4.327 0 1.893-1.09 3.155-2.994 3.403 2.331.247 3.636 1.69 3.636 3.876C18 18.536 16.01 20 12.46 20H6Zm2.78-9.284h2.824c1.819 0 2.91-.744 2.91-2.119 0-1.442-1.027-2.118-2.91-2.118H8.781v4.237Zm0 6.805h3.552c1.732 0 2.823-.766 2.823-2.23 0-1.488-1.07-2.277-2.823-2.277H8.78v4.507Z"
    />
  </svg>
);
export default SvgBold;
