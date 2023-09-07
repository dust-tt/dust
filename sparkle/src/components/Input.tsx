import React, { HTMLInputTypeAttribute, InputHTMLAttributes } from "react";

export interface InputProps {
  disabled?: boolean;
  type: HTMLInputTypeAttribute;
  name?: string;
  id?: string;
  className?: string;
  value?: InputHTMLAttributes<HTMLInputElement>["value"];
  placeholder?: string;
  onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
}

const Input: React.FC<InputProps> = ({
  disabled,
  type,
  name,
  id,
  className,
  value,
  placeholder,
  onChange,
}) => {
  return (
    <input
      disabled={disabled}
      type={type}
      name={name}
      id={id}
      className={className}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
    />
  );
};

export default Input;
