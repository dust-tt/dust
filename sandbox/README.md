# Dust Sandbox Docker Image

A well-optimized Docker image for the Northflank sandbox environment with TypeScript and Python capabilities.

## Features

### TypeScript (via Bun)

- **Runtime:** [Bun](https://bun.sh/) - Fast JavaScript runtime and package manager
- **Type Checking:** [tsgo](https://github.com/microsoft/typescript-go) - Microsoft's native TypeScript compiler (10x faster)
- **Linting/Formatting:** [Biome](https://biomejs.dev/) - Fast linter and formatter

**Included Libraries:**
- `@dust-tt/client` - Dust SDK
- `react`, `react-dom` - React framework
- `zod` - Schema validation
- `recharts`, `d3` - Data visualization
- `lodash`, `date-fns` - Utilities
- `axios`, `node-fetch` - HTTP clients
- `pdf-lib`, `pdfjs-dist` - PDF handling
- `exceljs`, `csv-parse`, `csv-stringify` - Spreadsheet/CSV
- `cheerio`, `turndown` - HTML parsing and conversion
- `uuid`, `crypto-js`, `dotenv` - Utilities

### Python

**Data Analysis:**
- `pandas`, `polars` - DataFrames
- `numpy`, `scipy` - Numerical/scientific computing
- `scikit-learn` - Machine learning

**Visualization:**
- `matplotlib`, `seaborn` - Static plots
- `plotly` - Interactive charts

**Document Processing:**
- `pypdf`, `pdfplumber`, `reportlab` - PDF handling
- `openpyxl`, `xlrd` - Excel files
- `python-pptx` - PowerPoint
- `python-docx` - Word documents
- `Pillow` - Image processing

**HTTP & Utilities:**
- `requests`, `httpx`, `aiohttp` - HTTP clients
- `pydantic` - Data validation
- `arrow` - Date/time handling

## Building

```bash
docker build -t dust-sandbox ./sandbox
```

## Verification

Test that tools are available:

```bash
docker run --rm dust-sandbox bun --version
docker run --rm dust-sandbox tsgo --version
docker run --rm dust-sandbox biome --version
docker run --rm dust-sandbox python3 --version
```

Test TypeScript dependencies:

```bash
docker run --rm dust-sandbox bun -e "import { z } from 'zod'; console.log('zod ok')"
```

Test Python dependencies:

```bash
docker run --rm dust-sandbox python3 -c "import pandas; print('pandas ok')"
```

## Usage

Run an interactive shell:

```bash
docker run -it --rm dust-sandbox
```

Run a TypeScript file:

```bash
docker run --rm -v $(pwd):/workspace dust-sandbox bun run script.ts
```

Run a Python script:

```bash
docker run --rm -v $(pwd):/workspace dust-sandbox python3 script.py
```

## Architecture

The image uses a multi-stage build for optimization:

1. **Builder Stage:** Compiles Python packages with C extensions (numpy, pandas, etc.)
2. **Runtime Stage:** Minimal runtime with pre-built packages

This reduces the final image size by excluding build tools and intermediate files.

## Customization

### Adding TypeScript Dependencies

Edit `package.json` and rebuild:

```json
{
  "dependencies": {
    "your-package": "^1.0.0"
  }
}
```

### Adding Python Dependencies

Edit `requirements.txt` and rebuild:

```
your-package>=1.0.0
```
