import type { SVGProps } from "react";
import * as React from "react";

const SvgGojiberry = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width={24} height={24} fill="#fff" rx={6} />
    <path fill="#FD8A6B" d="M4.77 14.96V8.87l7.24 5.04V20z" />
    <path fill="#FA5C5C" d="M19.23 12.17V6.08l-7.24 5.04v6.09z" />
    <path fill="#FEC288" d="M4.77 4h7.2v5h-7.2z" />
  </svg>
);
export default SvgGojiberry;
