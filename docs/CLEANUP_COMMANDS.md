# DDP Cleanup Commands

This document describes all available cleanup commands in the DDP project.

## Quick Reference

| Command               | Description                                                     | Use Case                                |
| --------------------- | --------------------------------------------------------------- | --------------------------------------- |
| `npm run clean`       | **Main cleanup** - Removes all test outputs and temp files      | After running tests or generating files |
| `npm run clean:quick` | **Fast cleanup** - Removes only output folders and alter.sql    | Quick cleanup after testing             |
| `npm run clean:all`   | **Deep cleanup** - Removes everything including generated files | Complete project reset                  |
| `npm run clean:deep`  | **Nuclear cleanup** - Removes node_modules and reinstalls       | When dependencies are corrupted         |

## Detailed Commands

### Main Cleanup Commands

#### `npm run clean`

**Main cleanup command** - Removes all test outputs and temporary files

- Removes `test-output/` directory
- Removes `output/` and `custom-output/` directories
- Removes `dist/` directory
- Removes temporary SQL files (except `test-database-setup.sql`)
- Removes log files and system files

#### `npm run clean:quick`

**Fast cleanup** - Removes only the most common output files

- Removes `test-output/`, `output/`, `custom-output/` directories
- Removes `alter.sql` files
- **Use this after running tests or generating files**

### Specific Cleanup Commands

#### `npm run clean:test-output`

Removes only the `test-output/` directory

#### `npm run clean:output`

Removes `output/` and `custom-output/` directories

#### `npm run clean:dist`

Removes the `dist/` directory (compiled TypeScript)

#### `npm run clean:temp`

Removes temporary files:

- SQL files (except `test-database-setup.sql` and docs)
- Log files (`.log`, `npm-debug.log*`)
- System files (`.DS_Store`)

#### `npm run clean:logs`

Removes only log files

#### `npm run clean:coverage`

Removes the `coverage/` directory

#### `npm run clean:build`

Removes `dist/` and rebuilds the project

### Advanced Cleanup Commands

#### `npm run clean:all`

**Complete cleanup** - Removes everything including generated files

- Runs all basic cleanup commands
- Removes `schema-sync_*` files
- Removes `alter_*` files

#### `npm run clean:deep`

**Nuclear cleanup** - Complete project reset

- Runs `clean:all`
- Removes `node_modules/`
- Reinstalls dependencies with `npm install`
- **Use only when dependencies are corrupted**

### Combined Commands

#### `npm run test:clean`

Runs tests and then cleans up output files

#### `npm run gen:clean`

Shows gen command help and cleans up

#### `npm run sync:clean`

Shows sync command help and cleans up

## Usage Examples

### After Running Tests

```bash
# Run tests and clean up
npm run test:clean

# Or run tests, then clean up manually
npm test
npm run clean:quick
```

### After Generating Files

```bash
# Generate files
npm run dev gen -- --schema dev --output ./test-output/dev

# Clean up generated files
npm run clean:quick
```

### After Running Sync

```bash
# Run sync command
npm run dev sync -- --source-schema dev --target-schema prod

# Clean up sync output
npm run clean:quick
```

### Complete Project Reset

```bash
# Nuclear option - complete reset
npm run clean:deep
```

## Best Practices

1. **Use `clean:quick`** for most cleanup needs
2. **Use `clean`** for comprehensive cleanup
3. **Use `clean:deep`** only when dependencies are corrupted
4. **Run cleanup after testing** to keep project clean
5. **Use `test:clean`** to automatically clean after tests

## Files Preserved

The following files are **never deleted** by cleanup commands:

- `test-database-setup.sql` - Database setup script
- Files in `docs/` directory - Documentation
- Files in `tests/fixtures/` - Test fixtures
- Source code files in `src/`
- Configuration files
