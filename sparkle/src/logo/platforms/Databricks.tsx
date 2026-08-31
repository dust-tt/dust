import type { SVGProps } from "react";
import * as React from "react";

const SvgDatabricks = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    xmlSpace="preserve"
    width="1em"
    height="1em"
    viewBox="0 0 193 200"
    style={{
      fillRule: "evenodd",
      clipRule: "evenodd",
      strokeLinejoin: "round",
      strokeMiterlimit: 2,
    }}
    {...props}
  >
    <path
      d="m18.318 9.275-8.631 4.859L.445 8.942 0 9.182v3.77l9.687 5.431 8.63-4.84v1.995l-8.63 4.86-9.242-5.192-.445.24v.646l9.687 5.432 9.668-5.432v-3.769l-.445-.24-9.223 5.173-8.65-4.84V10.42l8.65 4.84 9.668-5.43V6.114l-.482-.277-9.186 5.155L1.482 6.41l8.205-4.6 6.741 3.787.593-.332v-.462L9.687.684 0 6.115v.592l9.687 5.432 8.63-4.86z"
      style={{
        fill: "#ee3d2c",
        fillRule: "nonzero",
      }}
      transform="matrix(9.92432 0 0 9.59693 0 -6.564)"
    />
  </svg>
);
export default SvgDatabricks;
