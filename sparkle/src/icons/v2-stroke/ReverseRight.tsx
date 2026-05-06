import type { SVGProps } from "react";
import * as React from "react";

const SvgReverseRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M2.965 13A7.035 7.035 0 0 1 10 5.965h7.502L15.269 3.73A1.034 1.034 0 1 1 16.73 2.27l4 4a1.034 1.034 0 0 1 0 1.462l-4 4a1.034 1.034 0 1 1-1.462-1.462l2.233-2.234H10a4.965 4.965 0 1 0 0 9.93h10a1.035 1.035 0 0 1 0 2.07H10A7.035 7.035 0 0 1 2.965 13"
    />
  </svg>
);
export default SvgReverseRight;
