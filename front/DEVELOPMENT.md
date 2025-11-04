# Front Development Guide

This guide explains how to work with the `front` project, including building, linting, formatting, and testing.

## Prerequisites

### Node Version

The project uses **Node.js 20.13.0** in CI/CD pipelines (as specified in `.github/workflows/build-and-lint-front.yml`).

Check your local Node version:
```bash
node --version
```

The local `.nvmrc` file specifies `20.19.2`, which is compatible. If you use `nvm`, run:
```bash
nvm use
```

### Important: SDK/JS Dependency

**The `front` project depends on `sdks/js` and must be built first!**

## Installation & Setup

### 1. Build SDK/JS (Required First Step)

```bash
cd sdks/js
npm install
npm run build
```

This creates the `@dust-tt/client` package that `front` depends on.

### 2. Install Front Dependencies

```bash
cd front
npm install
# or for a clean install:
npm ci
```

## Development Workflow

### Code Formatting

The project uses **Prettier** for code formatting.

#### Check formatting:
```bash
npm run format:check
```

#### Auto-fix formatting:
```bash
npm run format
```

Or for a specific file:
```bash
prettier --write path/to/file.ts
```

**Note:** Always run formatting before committing! CI will fail if code is not properly formatted.

### Linting

The project uses **ESLint** for code linting.

#### Run linter:
```bash
npm run lint
```

This runs two checks:
1. **Test filename check** - Ensures no `.test.ts` files in `pages/` directory have brackets in their names
2. **ESLint** - Lints all TypeScript/JavaScript files

**Memory Issue:** The linter can run out of memory on large codebases. If you encounter heap errors, you can:
- Lint specific files only
- Increase Node memory: `NODE_OPTIONS="--max-old-space-size=4096" npm run lint`

### TypeScript Type Checking

#### Run type checker:
```bash
npm run tsc
```

This runs TypeScript in no-emit mode to check for type errors without generating output files.

**Important:** TypeScript must pass in CI. Fix all type errors before pushing.

### Building

#### Development build:
```bash
npm run dev
```

#### Production build:
```bash
npm run build
```

This creates an optimized Next.js production build.

#### Build with bundle analysis:
```bash
npm run analyze
```

Uses `NODE_OPTIONS=--max-old-space-size=8192` for large bundle analysis.

### Testing

#### Run tests:
```bash
npm run test
```

#### Run tests in CI mode (with JUnit output):
```bash
npm run test:ci
```

This generates `junit.xml` for CI reporting.

#### Run tests with coverage:
```bash
npm run coverage
```

**Note:** Tests require PostgreSQL and Redis to be running. CI sets up:
- PostgreSQL 14.13 on port 5433
- Redis 7.2.5 on port 5434

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/build-and-lint-front.yml`) runs three jobs in parallel:

### 1. Tests Job
- Builds SDK/JS
- Installs front dependencies
- Sets up PostgreSQL and Redis
- Runs database migrations
- Executes tests with JUnit reporting

### 2. TypeScript Job
- Builds SDK/JS
- Installs front dependencies
- Runs `npm run tsc` to check types

### 3. Lint Job
- Installs SDK/JS dependencies (no build needed for linting)
- Installs front dependencies
- Runs `npm run lint` and `npm run format:check`

## Common Issues & Solutions

### Issue: "Cannot find module '@dust-tt/client'"

**Solution:** Build the SDK/JS first:
```bash
cd ../sdks/js && npm install && npm run build
```

### Issue: ESLint heap out of memory

**Solution:** Increase Node memory:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run lint
```

Or lint specific files only:
```bash
npx eslint path/to/file.ts
```

### Issue: Prettier fails with formatting errors

**Solution:** Auto-fix formatting:
```bash
npm run format
```

Then commit the changes.

### Issue: TypeScript errors about missing types

**Solution:** Ensure dependencies are installed and SDK/JS is built:
```bash
cd ../sdks/js && npm install && npm run build
cd ../front && npm install
```

## Package Scripts Reference

From `package.json`:

| Script | Description |
|--------|-------------|
| `dev` | Start Next.js dev server |
| `dev:all` | Start types, SDK/JS, front, and worker concurrently |
| `build` | Production build |
| `start` | Start production server |
| `lint` | Run ESLint and test filename checks |
| `lint:test-filenames` | Check for invalid test file names |
| `format` | Auto-fix formatting with Prettier |
| `format:check` | Check formatting without fixing |
| `tsc` | TypeScript type checking |
| `test` | Run tests |
| `test:ci` | Run tests with JUnit output |
| `coverage` | Run tests with coverage report |

## Pre-Commit Checklist

Before committing changes:

1. ✅ Format code: `npm run format`
2. ✅ Check linting: `npm run lint`
3. ✅ Check types: `npm run tsc`
4. ✅ Run relevant tests: `npm run test`
5. ✅ Verify SDK/JS is built if you changed it

## Best Practices

1. **Always build SDK/JS first** - The front project depends on it
2. **Run formatters before linting** - Prettier should run first
3. **Fix TypeScript errors immediately** - Don't let them accumulate
4. **Test locally before pushing** - CI runs all checks, so should you
5. **Use `npm ci` in CI/CD** - It's faster and more reliable than `npm install`
6. **Keep dependencies updated** - Regularly run `npm outdated` to check

## Additional Resources

- Next.js documentation: https://nextjs.org/docs
- TypeScript handbook: https://www.typescriptlang.org/docs
- ESLint rules: Check `.eslintrc.js`
- Prettier config: Check `.prettierrc`

## Debugging

### Enable verbose logging:
```bash
NODE_ENV=development npm run dev
```

### Run with debugger:
```bash
NODE_OPTIONS='--inspect' npm run dev
```

Then attach your debugger to the Node process.

### View build output:
```bash
npm run build 2>&1 | tee build.log
```

## Questions?

If you encounter issues not covered here, check:
1. GitHub Actions logs for similar errors
2. The repository's issue tracker
3. Ask the team in your communication channel
