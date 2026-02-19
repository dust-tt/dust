import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 25"
    {...props}
  >
    <path
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={0.5}
      d="M12.25 2.125v2.5H12a7.75 7.75 0 1 0 7.75 7.75 7.73 7.73 0 0 0-2.605-5.792l-1.968 1.969-.427.427V2.125h6.854l-.427.427-2.263 2.261a10.22 10.22 0 0 1 3.336 7.562c0 5.66-4.589 10.25-10.25 10.25s-10.25-4.59-10.25-10.25S6.34 2.125 12 2.125z"
    />
  </svg>
);
export default SvgArrowCircle;
