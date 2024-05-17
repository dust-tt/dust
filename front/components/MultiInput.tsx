import React, { useState } from "react";

interface MultiInputProps {
  initialValues: string[];
  onValuesChange: (values: string[]) => void;
}

export function MultiInput({ initialValues, onValuesChange }: MultiInputProps) {
  const [inputValue, setInputValue] = useState<string>("");
  const [values, setValues] = useState<string[]>(initialValues);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (inputValue.trim() !== "") {
        const newValues = [...values, inputValue.trim()];
        setValues(newValues);
        onValuesChange(newValues);
        setInputValue("");
      }
    }
  };

  const handleRemoveValue = (index: number) => {
    const newValues = values.filter((_, i) => i !== index);
    setValues(newValues);
    onValuesChange(newValues);
  };

  return (
    <div className="s-flex s-flex-col s-gap-1 s-text-sm">
      <p>White listed channel patterns:</p>
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        placeholder="Press Enter to add value"
        className="multi-input s-gap-1 rounded-lg border p-4"
      />
      <div className="s-flex s-flex-wrap s-gap-2">
        {values.map((value, index) => (
          <div
            key={index}
            className="value-tag rounded-md px-1 py-1 text-white"
            style={{
              backgroundColor: "gray",
            }}
          >
            {value}
            <button
              className="remove-button ml-1 cursor-pointer text-gray-400"
              onClick={() => handleRemoveValue(index)}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
