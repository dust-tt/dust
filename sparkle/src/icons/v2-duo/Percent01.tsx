import type { SVGProps } from "react";
import * as React from "react";

const SvgPercent01 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M18.269 4.268a1.034 1.034 0 1 1 1.462 1.463l-14 14a1.034 1.034 0 1 1-1.463-1.463z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M17.5 17.465a.035.035 0 0 0-.035.035c0 .02.016.035.035.035q.015 0 .024-.01l.011-.025-.01-.024a.04.04 0 0 0-.025-.011m-11-11a.035.035 0 0 0-.035.035c0 .02.016.035.035.035q.015 0 .024-.01l.011-.025-.01-.024a.04.04 0 0 0-.025-.011M19.535 17.5a2.035 2.035 0 1 1-4.07 0 2.035 2.035 0 0 1 4.07 0m-11-11a2.035 2.035 0 0 1-4.06.208l-.01-.208.01-.208A2.035 2.035 0 0 1 6.5 4.465l.208.01A2.035 2.035 0 0 1 8.535 6.5"
    />
  </svg>
);
export default SvgPercent01;
