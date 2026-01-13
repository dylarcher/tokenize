# Tokenize CLI

ESM-based CLI to extract design values from SCSS/CSS and generate a three-layer design token system.

## Requirements

- `Bun@>=1.3.6` | `Node.js@>=25.2.1`
- **sources:** `SCSS` (`dart-sass`) & `CSS` (`global`/`module`)

## Installation

```sh
bun i && bun link # Enable global CLI access
```

## Token Architecture

Tokenize generates a three-layer token system where each layer references the one below.

```sh
┌─────────────────────────────────────────────────────────┐
│  Component Tokens                      (scoped/modules) │
│  --button-primary-bg  →  {interactive.primary.default}  │
├─────────────────────────────────────────────────────────┤
│  Semantic Tokens                      (bridge/refs/map) │
│  interactive.primary.default  →  {color.blue.500}       │
├─────────────────────────────────────────────────────────┤
│  Primitive Tokens                        (base/options) │
│  color.blue.500  →  #3b82f6                             │
└─────────────────────────────────────────────────────────┘
```

## Commands

### `build`/`compile` - SCSS to CSS

Compiles SCSS files to flat CSS, separating global and component styles.

```sh
tokenize build tests/mocks/src
tokenize build tests/mocks/src --out tests/mocks/dist
tokenize build tests/mocks/src --exclude \*\*/\*.x.js
```

**Output:**

```sh
tests/mocks/dist/**/
├── global.css           # Merged non-component styles
├── components/
│   ├── Button.css
│   ├── Modal.css
│   └── ...
└── manifest.json        # Compilation metadata
```

### `scan`/`audit` - Extract Values

Scans CSS/SCSS files and extracts design values.

> e.g. `colors`, `spacing`, `typography`, etc…

```sh
tokenize scan tests/mocks/src                             # Scan SCSS sources
tokenize scan tests/mocks/dist                            # Scan compiled CSS
tokenize scan tests/mocks/src --out tests/mocks/dist/.tmp # Outputs directory
```

**Output:**

```sh
tests/mocks/dist/.tmp/
├── base.json          # Values from global styles
└── scoped.json        # Values from component styles
```

### `tokens` - Generate Token Layers

Generates design tokens from scanned values.

```sh
tokenize tokens --all              # Generate all layers
tokenize tokens primitives         # Generate primitives only
tokenize tokens semantic           # Generate semantic (requires primitives)
tokenize tokens components         # Generate components (requires semantic)
tokenize tokens --all --force      # Force regeneration
tokenize tokens --layer semantic   # By layer namespace (multi-layer)
```

**Output:**

```sh
tests/mocks/{.tmp,src,dist}/
├── primitives / .json / .scss / .css
├── semantic   / .json / .scss / .css
└── components / .json / .scss / .css
```

### `all` - Full Pipeline

Runs the complete workflow (e.g. `scan → tokens`).

```sh
tokenize all tests/mocks/src
tokenize all tests/mocks/src --out tests/mocks/dist/.tmp --exclude \*\*/\*.y.\*
```

### `init` - Generate Config

Creates a starter configuration file.

```sh
tokenize init
```

### `debug` - Trace Token

Traces a token's resolution chain through all layers.

```sh
tokenize debug button.primary.background
tokenize debug interactive.primary.default
```

**Example output:**

```sh
Tracing: button.primary.background
==================================================
[components] button.primary.background
   = {interactive.primary.default}
  -> [semantic] interactive.primary.default
     = {color.blue.500}
    -> [primitives] color.blue.500
       = #3b82f6
```

### `stats` - Token Analytics

Shows token statistics across all layers.

```sh
tokenize stats
```

**Example output:**

```sh
  Tokens              Statistics
==================================
  base/primitives     142 tokens
  semantic/bridge      87 tokens
  component/scope     156 tokens
----------------------------------
  Total(s)            385 tokens
```

### `types` - Bundle Declarations

Bundles TypeScript declaration files.

```sh
bun run type__build
```

## CLI Options

### Global Options

| Option | Description |
| :----- | :---------- |
| `-c, --config <path>` | Config file path (default: `tokenize.config.js`) |
| `-o, --out <path>` | Output directory |
| `-e, --exclude <pattern>` | Glob patterns to exclude (repeatable) |
| `-v, --version` | Show version number |
| `-h, --help` | Show help message |

### Output Control

| Option | Description |
| :----- | :---------- |
| `-V, --verbose` | Verbose output with additional details |
| `-Q, --quiet` | Suppress non-error output |
| `-N, --dry-run` | Preview actions without writing files |

### Token Generation

| Option | Description |
| :----- | :---------- |
| `-a, --all` | Generate all token layers |
| `-l, --layer <name>` | Specify layer to generate (repeatable) |
| `-f, --force` | Force regeneration of existing files |

## Configuration

Create a `tokenize.config.js` file in your project root.

```js
export default {
  scanDir: "tests/mocks/src", // Directory to scan for styles
  outDir: "tests/mocks/dist/.tmp", // Output directory for generated tokens
  compileOutDir: "tests/mocks/dist", // Output directory for compiled CSS
  ignore: ["node_modules", "dist", "build", ".git"], // Directories to ignore when scanning
  exclude: ["**/legacy/**", "**/vendor/**"], // Glob patterns to exclude
  componentPatterns: [
    /\.component\.s?css$/i,
    /\.module\.s?css$/i,
    /components\/.*\.s?css$/i,
  ], // Patterns to identify component files
  spacingBase: 4, // Base unit for spacing scale (in pixels)
  outputFormats: ["json", "scss", "css"], // Output formats to generate
};
```

## Workflow Examples

### Full Token Generation

```sh
# 1. Compile SCSS to flat CSS
tokenize build tests/mocks/src --out tests/mocks/dist

# 2. Scan compiled CSS for design values
tokenize scan tests/mocks/dist --out tests/mocks/dist/.tmp

# 3. Generate all token layers
tokenize tokens --all

# Or run everything at once:
tokenize all tests/mocks/src
```

### Incremental Updates

```sh
# Regenerate only semantic and component tokens
tokenize tokens semantic components --force
```

### Preview Changes

```sh
# See what would be generated without writing files
tokenize scan tests/mocks/src --dry-run
tokenize tokens --all --dry-run
```

## Output Formats

Tokens are generated in three formats for different use cases.

### JSON (Data)

```json
{
  "color": {
    "blue": {
      "500": "#3b82f6"
    }
  }
}
```

### SCSS (Variables)

```scss
$color-blue-500: #3b82f6;
$interactive-primary-default: $color-blue-500;
```

### CSS (Custom Properties)

```css
:root {
  --color-blue-500: #3b82f6;
  --interactive-primary-default: var(--color-blue-500);
}
```

## Using Generated Tokens

### CSS Import

```css
@import 'tests/mocks/dist/.tmp/primitives.css';
@import 'tests/mocks/dist/.tmp/semantic.css';
@import 'tests/mocks/dist/.tmp/components.css';

.btn {
  background: var(--button-primary-background);
  color: var(--button-primary-text);
}
```

### SCSS Import

```scss
@use 'tests/mocks/dist/.tmp/primitives' as p;
@use 'tests/mocks/dist/.tmp/semantic' as s;
@use 'tests/mocks/dist/.tmp/components' as c;

.btn {
  background: c.$button-primary-background;
  color: c.$button-primary-text;
}
```

### Programmatic Usage

```js
import { loadConfiguration, walkDirectory, categorizeHexColor } from 'tokenize';

const config = await loadConfiguration();
const files = walkDirectory('tests/mocks/src', { extensions: ['.scss'] });
```

## Project Structure

```sh
tokenize/
├── bin/
│   └── tokenize.js       # CLI entry point
├── src/
│   ├── index.js          # Library exports
│   ├── cli.js            # CLI router
│   ├── helperUtils/            # Utility modules
│   │   ├── config.js     # Configuration loading
│   │   ├── files.js      # File operations
│   │   ├── css.js        # CSS utilities
│   │   └── colors.js     # Color processing
│   ├── commands/         # CLI commands
│   │   ├── compile.js    # SCSS compilation
│   │   ├── scan.js       # Value extraction
│   │   ├── tokens.js     # Token generation
│   │   └── types.js      # Type bundling
│   └── generators/       # Token generators
│       ├── primitives.js # Raw design values
│       ├── semantic.js   # Semantic tokens
│       └── components.js # Component tokens
├── tokenize.config.js    # Default configuration
└── package.json
```

## npm Scripts

| Script | Description |
| :----- | :---------- |
| `bun run build` | Compile SCSS files |
| `bun run audit` | Scan for style values |
| `bun run tokens` | Generate all token layers |
| `bun run cli` | Run full pipeline |
| `bun run start` | Initialize config |
| `bun run debug` | Debug token resolution |
| `bun run stats` | Show token statistics |
