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
      fill="currentColor"
      d="m12 8.5 2.116 5.088 5.493.44-4.185 3.585 1.278 5.36L12 20.1l-4.702 2.872 1.278-5.36-4.184-3.584 5.492-.44zm0 5.207-.739 1.776-1.916.154 1.46 1.251-.447 1.871L12 17.756l1.641 1.003-.446-1.87 1.46-1.252-1.916-.154zM8 2v9H6V2zm10 0v9h-2V2zm-5 0v5h-2V2z"
    />
  </svg>
);
export default SvgMedal;
