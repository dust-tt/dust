import type { SVGProps } from "react";
import * as React from "react";
const SvgFront = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#A857F1" d="M3.003 20.644h5.933V8.908h11.829V3H3.003v17.644Z" />
    <path
      fill="#A857F1"
      d="M15.648 20.997a5.352 5.352 0 1 0 0-10.704 5.352 5.352 0 0 0 0 10.704Z"
    />
  </svg>
);
export default SvgFront;
