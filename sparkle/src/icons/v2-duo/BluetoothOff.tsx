import type { SVGProps } from "react";
import * as React from "react";

const SvgBluetoothOff = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.965 7.5V2a1.036 1.036 0 0 1 1.697-.795l6 5a1.035 1.035 0 0 1 0 1.59l-3.308 2.758a1.036 1.036 0 0 1-1.326-1.59l2.356-1.964-3.349-2.79v3.29a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M2.269 2.268a1.034 1.034 0 0 1 1.463 0l18 18a1.034 1.034 0 1 1-1.463 1.463l-2.878-2.878-4.728 3.942A1.035 1.035 0 0 1 10.965 22v-7.791l-4.302 3.586a1.034 1.034 0 1 1-1.325-1.59l5.13-4.275L2.268 3.73a1.034 1.034 0 0 1 0-1.463M13.036 19.79l2.886-2.405-2.886-2.887z"
    />
  </svg>
);
export default SvgBluetoothOff;
