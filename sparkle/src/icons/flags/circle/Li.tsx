import type { SVGProps } from "react";
import * as React from "react";

const SvgLi = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#D80027"
      d="M20 10c0 5.523-4.477 10-10 10S0 15.523 0 10c.435 0 10-1.304 10-1.304z"
    />
    <path fill="#0052B4" d="M0 10C0 4.477 4.477 0 10 0s10 4.477 10 10" />
    <path
      fill="#FFDA44"
      d="M7.391 6.957a1.304 1.304 0 0 0-2.174-.972v-.768h.435v-.87h-.435v-.434h-.87v.435h-.434v.87h.435v.767a1.304 1.304 0 0 0-1.74 1.944v.767h4.348v-.768a1.3 1.3 0 0 0 .435-.971"
    />
  </svg>
);
export default SvgLi;
