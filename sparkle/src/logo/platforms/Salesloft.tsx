import type { SVGProps } from "react";
import * as React from "react";

const SvgSalesloft = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Salesloft_svg__a)">
      <rect width={24} height={24} fill="#F7F7F7" rx={6} />
      <path
        fill="#B4D625"
        d="M15.844 18.295c0-.841.673-1.557 1.557-1.557.926 0 1.599.716 1.599 1.557 0 .842-.673 1.557-1.557 1.557-.968.042-1.6-.715-1.6-1.557"
      />
      <path
        fill="#06492E"
        d="M8.255 7.07c0-1.094 1.051-1.977 2.398-1.977 1.725 0 2.777.799 3.366 4.965h.379l.547-5.68c-3.913-1.347-8.71.083-8.794 4.165 0 4.418 7.027 4.418 7.027 8.457 0 1.179-1.052 1.978-2.23 1.978-3.114 0-3.83-2.609-3.998-5.344h-.379l-1.01 5.134s2.315 1.346 4.797 1.346c2.988-.042 4.966-2.23 5.05-4.544 0-4.418-7.153-5.344-7.153-8.5"
      />
    </g>
    <defs>
      <clipPath id="Salesloft_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgSalesloft;
