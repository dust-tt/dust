import type { SVGProps } from "react";
import * as React from "react";

const SvgCursor = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Cursor_svg__a)">
      <rect width={24} height={24} fill="#F7F7F7" rx={6} />
      <path
        fill="#72716D"
        d="m12 12 8.67 5.005a.6.6 0 0 1-.227.226l-8.102 4.678a.68.68 0 0 1-.68 0L3.557 17.23a.6.6 0 0 1-.226-.226z"
      />
      <path
        fill="#55544F"
        d="M12 2v10l-8.668 5.005a.6.6 0 0 1-.083-.31v-9.39c0-.222.118-.425.309-.536l8.102-4.678A.7.7 0 0 1 12 2"
      />
      <path
        fill="#43413C"
        d="M20.669 6.995a.6.6 0 0 0-.226-.226L12.34 2.091A.7.7 0 0 0 12 2v10l8.67 5.005a.6.6 0 0 0 .082-.31v-9.39c0-.111-.029-.217-.083-.31"
      />
      <path
        fill="#D6D5D2"
        d="M20.063 7.345a.29.29 0 0 1 0 .29l-7.87 13.63c-.052.092-.193.054-.193-.052v-8.981q0-.109-.054-.201z"
      />
      <path
        fill="#FFF"
        d="m20.063 7.345-8.116 4.686a.4.4 0 0 0-.147-.147l-7.778-4.49c-.092-.053-.054-.194.052-.194h15.737c.112 0 .203.06.252.145"
      />
    </g>
    <defs>
      <clipPath id="Cursor_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCursor;
