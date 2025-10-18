import type { SVGProps } from "react";
import * as React from "react";
const SvgValTown = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width={24} height={24} rx={4} fill="white" />
    <g clipPath="url(#clip0_valtown)">
      <path
        d="M15.9 16.26C15.47 16.26 15.12 16.13 14.85 15.86C14.58 15.59 14.45 15.23 14.45 14.78V11.09H13.58V9.71H14.45V7.68H16.11V9.71H17.91V11.09H16.11V14.49C16.11 14.76 16.24 14.89 16.48 14.89H17.75V16.26H15.9Z"
        fill="black"
      />
      <path
        d="M12.26 10.46L9.49 15.05H9.26V10.72C9.26 10.16 8.81 9.71 8.25 9.71H7.59V15.18C7.59 15.78 8.08 16.26 8.67 16.26H9.8C10.4 16.26 10.96 15.94 11.26 15.42L14.56 9.71H13.58C13.04 9.71 12.54 10.00 12.26 10.46Z"
        fill="black"
      />
      <path d="M6.00 9.71H7.67V11.09H6.00V9.71Z" fill="black" />
    </g>
    <defs>
      <clipPath id="clip0_valtown">
        <rect
          width={12}
          height={8.63}
          fill="white"
          transform="translate(6 7.68)"
        />
      </clipPath>
    </defs>
  </svg>
);
export default SvgValTown;
