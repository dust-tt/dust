import type { SVGProps } from "react";
import * as React from "react";

const SvgLuma = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#000"
      d="M12.023 2c.132 2.836 1.287 5.396 3.404 7.318a10.3 10.3 0 0 0 5.362 2.557c.297.046.91.122 1.211.109-.023.006-.053.013-.075.02a10.3 10.3 0 0 0-7.102 3.26c-1.758 1.88-2.682 4.18-2.8 6.736a2 2 0 0 0-.02-.158c0-.343-.075-.889-.132-1.224a10.35 10.35 0 0 0-2.862-5.564 10.3 10.3 0 0 0-5.603-2.914 9 9 0 0 0-1.306-.135l-.1-.02c.38.003.827-.048 1.203-.103a10.3 10.3 0 0 0 5.475-2.63 10.35 10.35 0 0 0 3.326-7.084q.012-.084.019-.168"
    />
  </svg>
);
export default SvgLuma;
