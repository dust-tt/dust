import type { SVGProps } from "react";
import * as React from "react";

const SvgQobra = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 80 80"
    {...props}
  >
    <rect width={80} height={80} fill="#00161F" rx={16} />
    <path
      fill="#fff"
      d="M37.13 17c4.064 0 7.483 1.677 9.16 4.258l.452-3.484H59L52.677 63H40.42l2-14.387c-1.87 2.322-4.903 3.935-8.903 3.935C25.71 52.548 21 46.355 21 37.388 21 26.354 27.452 17 37.13 17m7.096 18.774.258-1.613c.516-4.064-1.484-6.838-4.71-6.838-3.87 0-6.387 3.935-6.387 8.903 0 3.742 1.613 6 4.774 6 3.29 0 5.549-2.323 6.065-6.452"
    />
  </svg>
);
export default SvgQobra;
