import type { SVGProps } from "react";
import * as React from "react";
const SvgTriangle = (props: SVGProps<SVGSVGElement>) => (
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
      fillRule="evenodd"
      d="M12 3 1.608 21h20.784L12 3Zm0 4L5.072 19h13.856L12 7Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgTriangle;
