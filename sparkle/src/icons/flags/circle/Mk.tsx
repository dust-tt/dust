import type { SVGProps } from "react";
import * as React from "react";

const SvgMk = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#FFDA44"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#D80027"
      d="M11.52 19.885a9.95 9.95 0 0 0 4.394-1.821L10 10zM8.479.115a9.95 9.95 0 0 0-4.393 1.82L10 10zM4.086 18.064a9.95 9.95 0 0 0 4.393 1.821L9.999 10zM1.936 4.086A9.95 9.95 0 0 0 .116 8.48L10 10z"
    />
    <path
      fill="#D80027"
      d="M.115 11.52a9.95 9.95 0 0 0 1.821 4.394L10 10zM19.885 8.48a9.95 9.95 0 0 0-1.821-4.394L10 10zM15.914 1.936A9.95 9.95 0 0 0 11.52.115L10 10zM18.064 15.914a9.95 9.95 0 0 0 1.821-4.393L10 10z"
    />
    <path
      fill="#D80027"
      d="M10 13.478a3.478 3.478 0 1 0 0-6.956 3.478 3.478 0 0 0 0 6.956"
    />
    <path
      fill="#FFDA44"
      d="M10 12.609a2.609 2.609 0 1 0 0-5.218 2.609 2.609 0 0 0 0 5.218"
    />
  </svg>
);
export default SvgMk;
