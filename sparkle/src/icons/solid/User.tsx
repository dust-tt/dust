import type { SVGProps } from "react";
import * as React from "react";
const SvgUser = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#000"
      d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 14a8 8 0 0 0-8 8h16a8 8 0 0 0-8-8Z"
    />
  </svg>
);
export default SvgUser;
