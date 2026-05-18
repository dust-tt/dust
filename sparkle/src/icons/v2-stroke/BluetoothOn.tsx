import type { SVGProps } from "react";
import * as React from "react";

const SvgBluetoothOn = (props: SVGProps<SVGSVGElement>) => (
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
      d="M11.56 1.062c.364-.17.794-.114 1.102.143l6 5a1.035 1.035 0 0 1 0 1.59L13.615 12l5.047 4.205a1.035 1.035 0 0 1 0 1.59l-6 5A1.035 1.035 0 0 1 10.965 22v-7.791l-4.303 3.586a1.034 1.034 0 1 1-1.324-1.59L10.384 12 5.338 7.795a1.034 1.034 0 1 1 1.324-1.59l4.303 3.585V2c0-.402.232-.767.595-.938m1.475 18.728L16.384 17l-3.349-2.791zm0-10L16.384 7l-3.349-2.791z"
    />
  </svg>
);
export default SvgBluetoothOn;
