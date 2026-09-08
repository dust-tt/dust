import type { SVGProps } from "react";
import * as React from "react";

const SvgPlayCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#play-circle_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12M10.028 6.882c.314.01.566.128.71.203.174.09.37.219.554.337l4.72 3.034c.158.101.337.215.477.324.141.11.367.307.5.622.162.382.162.814 0 1.196a1.6 1.6 0 0 1-.5.622c-.14.11-.319.223-.476.324l-4.721 3.034c-.183.118-.38.247-.554.337-.165.086-.47.227-.847.2a1.54 1.54 0 0 1-1.12-.611c-.227-.303-.273-.636-.29-.821-.017-.195-.016-.43-.016-.648v-6.07c0-.217-.001-.453.016-.648.017-.185.063-.518.29-.82l.107-.129a1.54 1.54 0 0 1 1.013-.483zm.507 7.722L14.585 12l-4.05-2.604zM23.035 12c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="play-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgPlayCircle;
