# unyek

A TypeScript/Deno script that un-serializes files created by [yek](https://github.com/bodo-run/yek). While `yek` reads files from a repository and combines them into a single serialized file, `unyek` does the opposite - it takes a yek file and restores the original files and directory structure.

## Requirements

- [Deno](https://deno.land/) runtime

## Usage

```bash
deno run --allow-read --allow-write unyek.ts <path-to-yek-file>
```

The script will:
1. Read the yek file
2. Extract all file contents
3. Recreate the original directory structure
4. Write all files to their original locations

### Examples

Given a yek file `output.yek` with contents:
```
>>>> src/main.js
console.log('hello');
>>>> README.md
# My Project
```

Running:
```bash
deno run --allow-read --allow-write unyek.ts output.yek
```

Will create:
```
src/
  main.js    # contains: console.log('hello');
README.md    # contains: # My Project
```

### Handling Chunked Files

The script automatically handles yek files where large files were split into parts:

```
>>>> large-file.js:part0
// first part
>>>> large-file.js:part1
// second part
```

Will be reconstructed into a single `large-file.js` with all parts combined in the correct order.

### Output

The script provides clear feedback about what it's doing:
```bash
✓ Written: src/main.js
✓ Written: large-file.js (from 2 parts)
```

## Notes

- Files are written relative to the current working directory
- Directories are created automatically if they don't exist
- The script handles both regular yek files and files split into parts
- Existing files will be overwritten

## Related

- [yek](https://github.com/bodo-run/yek) - The original tool that creates the serialized files that this script unpacks
