import type { SVGProps } from "react";
import * as React from "react";
const SvgMedal = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="m12 8.5 2.116 5.088 5.492.44-4.184 3.585 1.278 5.36L12 20.1l-4.702 2.872 1.278-5.36-4.184-3.584 5.492-.44L12 8.5Zm0 5.207-.739 1.776-1.916.154 1.46 1.251-.447 1.871L12 17.756l1.641 1.003-.446-1.87 1.46-1.252-1.916-.154L12 13.707ZM8 2v9H6V2h2Zm10 0v9h-2V2h2Zm-5 0v5h-2V2h2Z"
    />
  </svg>
);
export default SvgMedal;
