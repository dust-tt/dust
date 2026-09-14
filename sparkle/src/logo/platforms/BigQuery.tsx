import type { SVGProps } from "react";
import * as React from "react";

const SvgBigQuery = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#3BA256" d="M11 8h2v12h-2zM8 12h2v7H8zM14 14h2v5h-2z" />
    <path
      fill="#FBBC05"
      d="M11.886 1.62c5.67 0 10.265 4.596 10.265 10.266S17.555 22.15 11.886 22.15 1.62 17.555 1.62 11.886 6.216 1.62 11.886 1.62m0 3.422a6.844 6.844 0 1 0 0 13.689 6.844 6.844 0 0 0 0-13.689"
    />
    <path
      fill="#4285F4"
      d="M19.106 4.59a10.23 10.23 0 0 1 3.045 7.296c0 2.217-.705 4.267-1.9 5.945L24 21.581 21.58 24l-6.219-6.219a6.84 6.84 0 0 0 3.369-5.895 6.82 6.82 0 0 0-2.012-4.847z"
    />
    <path
      fill="#EA4335"
      d="M11.886 1.62c2.834 0 5.4 1.15 7.259 3.007l-2.42 2.419a6.844 6.844 0 0 0-11.683 4.84H1.62c0-5.67 4.597-10.266 10.266-10.266"
    />
  </svg>
);
export default SvgBigQuery;
