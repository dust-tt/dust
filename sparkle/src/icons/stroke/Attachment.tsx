import type { SVGProps } from "react";
import * as React from "react";
const SvgAttachment = (props: SVGProps<SVGSVGElement>) => (
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
      d="m14.829 7.757-5.657 5.657a1 1 0 1 0 1.414 1.415l5.657-5.657A3 3 0 0 0 12 4.929l-5.657 5.657a5 5 0 0 0 7.071 7.07L19.071 12l1.414 1.414-5.656 5.657a7 7 0 1 1-9.9-9.9l5.657-5.656a5 5 0 0 1 7.071 7.07L12 16.244A3 3 0 1 1 7.758 12l5.656-5.657 1.415 1.414Z"
    />
  </svg>
);
export default SvgAttachment;
