import type { SVGProps } from "react";
import * as React from "react";
const SvgImage = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20 5H4v14l9.292-9.294a1 1 0 0 1 1.415 0L20 15.01V5ZM2 3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993ZM8 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"
    />
  </svg>
);
export default SvgImage;
