import type { SVGProps } from "react";
import * as React from "react";

const SvgCodeBox = (props: SVGProps<SVGSVGElement>) => (
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
      d="M22 3v18H2V3zM4 5v14h16V5zm16 7-3.535 3.536-1.415-1.415L17.172 12 15.05 9.879l1.415-1.415zM6.828 12l2.122 2.121-1.414 1.415L4 12l3.536-3.536L8.95 9.88zm4.416 5H9.116l3.64-10h2.128z"
    />
  </svg>
);
export default SvgCodeBox;
