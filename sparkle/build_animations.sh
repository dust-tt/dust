#!/bin/bash

# Set the input and output directories
input_dir="src/lottie/src"
output_dir="src/lottie"

# Create the output directory if it doesn't exist
mkdir -p "$output_dir"

# Loop through each JSON file in the input directory
for file in "$input_dir"/*.json; do
  # Check if the file exists
  if [ -e "$file" ]; then
    # Extract the base filename without the extension
    filename=$(basename "$file" .json)
    
    # Set the output TypeScript file path
    output_file="$output_dir/$filename.ts"
    
    # Convert JSON to TypeScript
    echo "const animation = $(cat "$file");" > "$output_file"
    echo "" >> "$output_file"
    echo "export default animation;" >> "$output_file"
    
    echo "Converted $file to $output_file"
  fi
done
