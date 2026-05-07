import type { SVGProps } from "react";
import * as React from "react";

const SvgCloudLightning = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#cloud-lightning_svg__a)">
      <path
        fill="currentColor"
        d="M12.139 9.426a1.035 1.035 0 0 1 1.722 1.148l-2.926 4.39H15a1.035 1.035 0 0 1 .861 1.61l-4 6a1.035 1.035 0 0 1-1.722-1.148l2.926-4.39H9a1.035 1.035 0 0 1-.861-1.61zm8.826 2.074a3.465 3.465 0 0 0-3.14-3.45 1.035 1.035 0 0 1-.926-.863 4.967 4.967 0 0 0-9.798 0 1.035 1.035 0 0 1-.926.863 3.466 3.466 0 0 0-.83 6.719 1.034 1.034 0 1 1-.69 1.95 5.537 5.537 0 0 1 .568-10.606 7.035 7.035 0 0 1 13.554 0 5.537 5.537 0 0 1 .568 10.607 1.035 1.035 0 1 1-.69-1.951 3.47 3.47 0 0 0 2.31-3.269"
      />
    </g>
    <defs>
      <clipPath id="cloud-lightning_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCloudLightning;
