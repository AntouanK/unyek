import { ensureDir } from "https://deno.land/std/fs/mod.ts";
import { dirname } from "https://deno.land/std/path/mod.ts";

// Constants
const FILE_MARKER = ">>>>";
const PART_REGEX = /^(.+):part(\d+)$/;

// Types
interface FilePart {
  path: string;
  partNumber: number;
  content: string;
}

interface FileWithParts {
  parts: FilePart[];
  basePath: string;
}

/**
 * Parses a file path that might contain a part suffix
 * @param path - File path that might contain :partN suffix
 * @returns Object containing the base path and part number if it exists
 */
function parseFilePath(path: string): {
  basePath: string;
  partNumber: number | null;
} {
  const match = path.match(PART_REGEX);
  if (!match) {
    return { basePath: path, partNumber: null };
  }
  return {
    basePath: match[1],
    partNumber: parseInt(match[2], 10),
  };
}

/**
 * Groups file parts by their base path
 * @param files - Map of file paths to their contents
 * @returns Map of base paths to their file parts
 */
function groupFilesByBasePath(
  files: Map<string, string>
): Map<string, FileWithParts> {
  const groupedFiles = new Map<string, FileWithParts>();

  for (const [path, content] of files) {
    const { basePath, partNumber } = parseFilePath(path);

    if (!groupedFiles.has(basePath)) {
      groupedFiles.set(basePath, { parts: [], basePath });
    }

    const fileGroup = groupedFiles.get(basePath)!;

    if (partNumber !== null) {
      fileGroup.parts.push({ path, partNumber, content });
    } else {
      // If it's not a part file, treat it as a single part
      fileGroup.parts.push({ path, partNumber: 0, content });
    }
  }

  return groupedFiles;
}

/**
 * Combines parts of a file in the correct order
 * @param fileParts - Array of file parts
 * @returns Combined content of all parts
 */
function combineFileParts(fileParts: FilePart[]): string {
  // Sort parts by part number
  const sortedParts = [...fileParts].sort(
    (a, b) => a.partNumber - b.partNumber
  );
  return sortedParts.map((part) => part.content).join("");
}

/**
 * Parses the content of a yek file into a Map of file paths to their contents
 * @param content - Raw content of the yek file
 * @returns Map where keys are file paths and values are file contents
 */
function parseYekContent(content: string): Map<string, string> {
  const result = new Map<string, string>();
  const sections = content.split(new RegExp(`^${FILE_MARKER}\\s+`, "m"));

  // First section is empty due to split, so we skip it
  for (const section of sections.slice(1)) {
    const firstNewline = section.indexOf("\n");
    if (firstNewline === -1) continue;

    const path = section.slice(0, firstNewline).trim();
    const fileContent = section.slice(firstNewline + 1);

    if (path) {
      result.set(path, fileContent);
    }
  }

  return result;
}

/**
 * Ensures that the directory for a file exists
 * @param filePath - Path to the file
 */
async function ensureDirectoryExists(filePath: string): Promise<void> {
  const directory = dirname(filePath);
  await ensureDir(directory);
}

/**
 * Writes content to a file, creating directories if needed
 * @param path - Path where to write the file
 * @param content - Content to write
 */
async function writeFileContent(path: string, content: string): Promise<void> {
  await ensureDirectoryExists(path);
  await Deno.writeTextFile(path, content);
}

/**
 * Main function that processes a yek file and writes its contents
 * @param yekPath - Path to the yek file
 */
async function unyekFile(yekPath: string): Promise<void> {
  try {
    const content = await Deno.readTextFile(yekPath);
    const files = parseYekContent(content);
    const groupedFiles = groupFilesByBasePath(files);

    for (const [basePath, fileGroup] of groupedFiles) {
      try {
        const combinedContent = combineFileParts(fileGroup.parts);
        await writeFileContent(basePath, combinedContent);
        console.log(
          `✓ Written: ${basePath} (from ${fileGroup.parts.length} part${
            fileGroup.parts.length === 1 ? "" : "s"
          })`
        );
      } catch (error) {
        console.error(`✗ Failed to write ${basePath}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`Error processing yek file: ${error.message}`);
    Deno.exit(1);
  }
}

// Handle command line arguments
if (import.meta.main) {
  const yekPath = Deno.args[0];
  if (!yekPath) {
    console.error("Please provide a path to a yek file");
    Deno.exit(1);
  }

  unyekFile(yekPath);
}
