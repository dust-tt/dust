import type { SVGProps } from "react";
import * as React from "react";

const SvgShapes = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <circle cx={16.5} cy={7.5} r={4.5} stroke="currentColor" strokeWidth={2} />
    <rect
      width={8}
      height={6}
      x={13}
      y={15}
      stroke="currentColor"
      strokeWidth={2}
      rx={1}
    />
    <path
      stroke="currentColor"
      strokeWidth={2}
      d="M5.225 5.636c.229-.885.343-1.328.523-1.433a.5.5 0 0 1 .504 0c.18.105.294.548.523 1.433l2.967 11.5c.088.341.132.512.091.646a.5.5 0 0 1-.218.282c-.12.073-.296.073-.648.073H3.033c-.352 0-.528 0-.648-.073a.5.5 0 0 1-.218-.282c-.04-.134.003-.305.091-.645z"
    />
  </svg>
);
export default SvgShapes;
