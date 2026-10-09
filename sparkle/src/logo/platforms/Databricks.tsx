import type { SVGProps } from "react";
import * as React from "react";

const SvgDatabricks = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Databricks_svg__a)">
      <path
        fill="#EE3D2C"
        d="m20.53 10.245-8.566 4.663-9.172-4.983-.442.23v3.619l9.614 5.212 8.564-4.645v1.914l-8.564 4.664-9.172-4.982-.442.23v.62L11.964 22l9.594-5.213V13.17l-.441-.23-9.153 4.964-8.585-4.645v-1.915l8.585 4.645 9.594-5.212V7.211l-.478-.266-9.116 4.948L3.82 7.495l8.143-4.414 6.69 3.634.588-.319v-.443L11.964 2 2.35 7.212v.568l9.614 5.213 8.564-4.664z"
      />
    </g>
    <defs>
      <clipPath id="Databricks_svg__a">
        <path fill="#fff" d="M2.35 2h19.3v20H2.35z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgDatabricks;
