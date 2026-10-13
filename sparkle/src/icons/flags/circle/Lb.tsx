import type { SVGProps } from "react";
import * as React from "react";

const SvgLb = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#D80027"
      d="M10 0A10 10 0 0 0 .992 5.652h18.016A10 10 0 0 0 10 0M10 20a10 10 0 0 0 9.008-5.652H.992A10 10 0 0 0 10 20"
    />
    <path
      fill="#6DA544"
      d="M12.608 11.74 9.999 6.956l-2.608 4.782h1.956v1.304h1.305V11.74z"
    />
  </svg>
);
export default SvgLb;
