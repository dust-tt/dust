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
    <div className="multi-input-container">
      <div className="values-container">
        {values.map((value, index) => (
          <div key={index} className="value-tag">
            {value}
            <button className="remove-button" onClick={() => handleRemoveValue(index)}>
              &times;
            </button>
          </div>
        ))}
      </div>
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        placeholder="Press Enter to add value"
        className="multi-input"
      />
    </div>
  );
}