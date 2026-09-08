import type { SVGProps } from "react";
import * as React from "react";

const SvgSlab = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#50C5DC"
      fillRule="evenodd"
      d="M11.797 8.673H22.01v-1.93C22.01 4.124 19.725 2 16.904 2H6.995c2.673.151 4.802 6.673 4.802 6.673"
      clipRule="evenodd"
    />
    <path
      fill="#FCB415"
      fillRule="evenodd"
      d="M12 12.01H1.99V6.892C1.99 4.19 4.23 2 6.995 2h9.712c-2.62.156-4.725 2.281-4.725 4.881z"
      clipRule="evenodd"
    />
    <path
      fill="#741448"
      fillRule="evenodd"
      d="M12.006 15.488H1.996v1.919c0 2.602 2.24 4.713 5.005 4.713h9.712c-2.62-.15-4.707-6.632-4.707-6.632"
      clipRule="evenodd"
    />
    <path
      fill="#FF4143"
      fillRule="evenodd"
      d="M12 12.01h10.01v5.118c0 2.702-2.24 4.892-5.005 4.892H7.293c2.62-.157 4.725-2.281 4.725-4.881z"
      clipRule="evenodd"
    />
    <path
      fill="#fff"
      fillRule="evenodd"
      d="M3.93 10.163h6.112v-.816H3.93zm0-1.86h6.112v-.815H3.93zm0-1.859h6.112V5.63H3.93zm9.984 8.259h6.113v-.816h-6.113zm0 1.859h6.113v-.816h-6.113zm0 1.86h6.113v-.817h-6.113z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgSlab;
