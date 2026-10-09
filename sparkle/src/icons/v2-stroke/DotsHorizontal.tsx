import type { SVGProps } from "react";
import * as React from "react";

const SvgDotsHorizontal = (props: SVGProps<SVGSVGElement>) => (
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
      d="M19 11.965a.035.035 0 0 0-.035.035c0 .02.016.035.035.035q.015 0 .024-.01l.011-.025-.01-.024a.04.04 0 0 0-.025-.011m-6.976.01a.04.04 0 0 0-.024-.01.035.035 0 0 0-.035.035c0 .02.016.035.035.035q.015 0 .024-.01l.011-.025zm-7 0a.04.04 0 0 0-.024-.01.035.035 0 0 0-.035.035c0 .02.016.035.035.035q.015 0 .024-.01L5.035 12zM7.035 12a2.035 2.035 0 0 1-4.06.208L2.966 12l.01-.208A2.035 2.035 0 0 1 5 9.965l.208.01A2.035 2.035 0 0 1 7.035 12m7 0A2.035 2.035 0 1 1 12 9.965l.208.01A2.035 2.035 0 0 1 14.035 12m7 0A2.035 2.035 0 1 1 19 9.965l.208.01A2.035 2.035 0 0 1 21.035 12"
    />
  </svg>
);
export default SvgDotsHorizontal;
