import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

interface Probe {
  /** Executable to look for. */
  bin: string;
  /** What the agent should reach for it for. */
  use: string;
  /** Arguments that print a version, when the tool has a cheap one. */
  version?: string[];
}

/**
 * The tools Mentor pre-installs on the server. Keep this list in sync with
 * scripts/install-tools.sh: the inventory is how the agent knows it can use
 * these without spending a turn on `which` or, worse, apt-get.
 */
const PROBES: Probe[] = [
  { bin: "pdftotext", use: "PDF text extraction", version: ["-v"] },
  { bin: "pdfinfo", use: "PDF metadata and page count", version: ["-v"] },
  { bin: "pdftoppm", use: "PDF pages to images", version: ["-v"] },
  { bin: "pdfimages", use: "images out of a PDF", version: ["-v"] },
  { bin: "tesseract", use: "OCR images and scans", version: ["--version"] },
  { bin: "ocrmypdf", use: "add a searchable text layer to a PDF", version: ["--version"] },
  { bin: "gs", use: "repair, compress or rasterize a PDF", version: ["--version"] },
  { bin: "qpdf", use: "merge, split, rotate or unlock a PDF", version: ["--version"] },
  { bin: "convert", use: "ImageMagick: crop, resize, convert images", version: ["-version"] },
  { bin: "pandoc", use: "convert between docx, Markdown, HTML and more", version: ["--version"] },
  { bin: "soffice", use: "LibreOffice headless: docx/pptx/xlsx to PDF", version: ["--version"] },
  { bin: "pdflatex", use: "typeset a PDF from LaTeX", version: ["--version"] },
  { bin: "xelatex", use: "LaTeX with system fonts", version: ["--version"] },
  { bin: "weasyprint", use: "HTML and CSS to PDF", version: ["--version"] },
  { bin: "ffmpeg", use: "audio and video conversion", version: ["-version"] },
  { bin: "dot", use: "Graphviz diagrams", version: ["-V"] },
  { bin: "rg", use: "fast text search", version: ["--version"] },
  { bin: "jq", use: "read and reshape JSON", version: ["--version"] },
  { bin: "python3", use: "scripts, data work and the Python packages below", version: ["--version"] },
  { bin: "node", use: "JavaScript and npm packages", version: ["--version"] },
];

function firstLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

async function probe(item: Probe): Promise<string | null> {
  try {
    if (!item.version) {
      await run("sh", ["-c", `command -v ${JSON.stringify(item.bin)}`]);
      return `${item.bin} (${item.use})`;
    }
    const { stdout, stderr } = await run(item.bin, item.version, {
      timeout: 4000,
      maxBuffer: 256 * 1024,
    });
    const line = firstLine(stdout || stderr);
    return `${item.bin} (${item.use})${line ? ` - ${line}` : ""}`;
  } catch {
    return null;
  }
}

let cached: Promise<string> | undefined;

/**
 * A Markdown section for the system prompt. Probes are run in parallel once per
 * process, because the answer only changes when the image changes.
 */
export function toolsInventoryMarkdown(): Promise<string> {
  cached ??= (async () => {
    const rows = (await Promise.all(PROBES.map(probe))).filter(
      (row): row is string => Boolean(row),
    );
    if (!rows.length) return "";
    return [
      "## Pre-installed tools",
      "",
      "These command-line tools are already on the server. Use them directly instead of installing anything:",
      "",
      ...rows.map((row) => `- ${row}`),
      "",
      "If a task needs something on this list, run it through bash. Only install a package when the tool you need is missing above, the pre-installed one fails, or the student asks for a different tool. Check the real error before installing, and say what you installed in one line.",
    ].join("\n");
  })();
  return cached;
}