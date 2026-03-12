import type { SVGProps } from "react";
import * as React from "react";

const SvgVideo = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width={20} height={16} x={2} y={4} fill="#4BABFF" rx={2} />
    <path fill="#fff" d="m16 12-7 4V8z" />
  </svg>
);
export default SvgVideo;
