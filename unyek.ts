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
 * Determines if two parts should be joined without whitespace
 * @param end - End of first part
 * @param start - Start of second part
 * @returns Whether the parts should be joined
 */
function shouldJoinParts(end: string, start: string): boolean {
  // Case 1: Split word or identifier
  if (end.match(/\w$/) && start.match(/^\w/)) return true;

  // Case 2: Split string literal
  if (end.match(/["']$/) && start.match(/^["']/)) return true;

  // Case 3: Split string content
  if (end.match(/["'][^"']*$/) && start.match(/^[^"']*["']/)) return true;

  return false;
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

  let result = "";
  for (let i = 0; i < sortedParts.length; i++) {
    const part = sortedParts[i];
    let content = part.content;

    // If this isn't the first part, check for continuations
    if (i > 0) {
      const prevContent = sortedParts[i - 1].content;

      // Get the actual content without trailing whitespace
      const prevContentTrimmed = prevContent.replace(/\s+$/, "");
      const currentContentTrimmed = content.replace(/^\s+/, "");

      // Look at the last few characters of previous part and first few of current
      const endChars = prevContentTrimmed.slice(-10); // Look at last 10 chars
      const startChars = currentContentTrimmed.slice(0, 10); // Look at first 10 chars

      if (shouldJoinParts(endChars, startChars)) {
        // Remove trailing whitespace from result and leading whitespace from content
        result = result.replace(/\s+$/, "");
        content = content.replace(/^\s+/, "");
      }
    }

    result += content;
  }

  return result;
}

/**
 * Parses the content of a yek file into a Map of file paths to their contents
 * @param content - Raw content of the yek file
 * @returns Map where keys are file paths and values are file contents
 */
function parseYekContent(content: string): Map<string, string> {
  const result = new Map<string, string>();

  // Find all marker positions
  const markerRegex = new RegExp(`^${FILE_MARKER}\\s+.*$`, "gm");
  let match;
  const markers: { index: number; marker: string }[] = [];

  while ((match = markerRegex.exec(content)) !== null) {
    markers.push({ index: match.index, marker: match[0] });
  }

  // Process each section
  for (let i = 0; i < markers.length; i++) {
    const currentMarker = markers[i];
    const nextMarker = markers[i + 1];

    // Extract the path (remove marker and trim)
    const path = currentMarker.marker.slice(FILE_MARKER.length).trim();

    // Extract content up to the next marker or end of file
    const contentStart = currentMarker.index + currentMarker.marker.length + 1; // +1 for the newline
    const contentEnd = nextMarker ? nextMarker.index : content.length;
    let fileContent = content.slice(contentStart, contentEnd);

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
