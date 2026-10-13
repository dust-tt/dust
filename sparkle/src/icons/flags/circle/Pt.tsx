import type { SVGProps } from "react";
import * as React from "react";

const SvgPt = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#6DA544"
      d="M0 10c0 4.3 2.714 7.965 6.522 9.378L7.392 10 6.521.622A10 10 0 0 0 0 10"
    />
    <path
      fill="#D80027"
      d="M20 10c0-5.523-4.477-10-10-10a10 10 0 0 0-3.478.622v18.756A10 10 0 0 0 10 20c5.523 0 10-4.477 10-10"
    />
    <path
      fill="#FFDA44"
      d="M6.522 13.478a3.478 3.478 0 1 0 0-6.956 3.478 3.478 0 0 0 0 6.956"
    />
    <path
      fill="#D80027"
      d="M4.565 8.26v2.175a1.957 1.957 0 0 0 3.913 0V8.26z"
    />
    <path
      fill="#F0F0F0"
      d="M6.521 11.087a.653.653 0 0 1-.652-.652v-.87h1.304v.87c0 .36-.292.652-.652.652"
    />
  </svg>
);
export default SvgPt;
