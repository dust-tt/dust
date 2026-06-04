import type { SVGProps } from "react";
import * as React from "react";

const SvgShapesPlus = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g transform="translate(1.991 2.011)">
      <path
        d="M4.15016 1.14626C4.34534 0.951083 4.66191 0.951254 4.8572 1.14626L7.8611 4.15016C8.05636 4.34543 8.05636 4.66193 7.8611 4.8572L4.8572 7.8611C4.66193 8.05636 4.34543 8.05636 4.15016 7.8611L1.14626 4.8572C0.951254 4.66191 0.951081 4.34534 1.14626 4.15016L4.15016 1.14626Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </g>
    <circle
      cx="17.864"
      cy="6.484"
      r="3.134"
      stroke="currentColor"
      strokeWidth="2"
    />
    <rect
      x="2.01"
      y="13.7"
      width="8.312"
      height="8.294"
      rx="3"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      stroke="currentColor"
      strokeWidth="1.911"
      strokeLinecap="round"
      d="M13.318 17.65h8.685M17.66 13.307v8.686"
    />
  </svg>
);
export default SvgShapesPlus;
