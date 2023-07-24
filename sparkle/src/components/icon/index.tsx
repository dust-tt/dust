// import React, { ComponentType } from "react";

// type IconProps = {
//   IconComponent?: ComponentType;
//   className?: string;
// };

// const Icon: React.FC<IconProps> = ({ IconComponent, className }) => {
//   return IconComponent ? <IconComponent className={className} /> : null;
// };

// export default Icon;

import React, { ComponentType, PropsWithChildren } from "react";

interface IconComponentProps {
  className?: string;
}

type IconProps = {
  IconComponent?: ComponentType<IconComponentProps>;
  className?: string;
};

const Icon: React.FC<IconProps> = ({ IconComponent, className }) => {
  return IconComponent ? <IconComponent className={className} /> : null;
};

export default Icon;
