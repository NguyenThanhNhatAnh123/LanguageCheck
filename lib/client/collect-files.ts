import { unzip } from "fflate";

// Browser-only: turn whatever the user picked or dropped (files, folders, .zip) into a flat
// list of images. Everything stays in memory; zips are extracted in the browser.

export interface PickedImage {
  file: File;
  /** Path inside the picked folder or zip when there is one, else the file name. */
  name: string;
}

export interface CollectResult {
  images: PickedImage[];
  /** Files that are neither images nor zips (or junk entries inside a zip). */
  skipped: number;
  /** Zips that could not be read. */
  brokenZips: number;
}

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function imageTypeFor(name: string): string | null {
  return IMAGE_TYPES[extension(name)] ?? null;
}

function isZip(file: File): boolean {
  return extension(file.name) === "zip" || file.type === "application/zip" || file.type === "application/x-zip-compressed";
}

/** macOS resource forks and hidden files inside archives/folders are never mockups. */
function isJunkPath(path: string): boolean {
  return path.split("/").some((part) => part.startsWith(".") || part === "__MACOSX");
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function extractZip(file: File): Promise<{ images: PickedImage[]; skipped: number }> {
  return file.arrayBuffer().then(
    (buffer) =>
      new Promise((resolve, reject) => {
        let skipped = 0;
        unzip(
          new Uint8Array(buffer),
          {
            filter: (entry) => {
              if (entry.name.endsWith("/")) return false; // directory
              const keep = !isJunkPath(entry.name) && imageTypeFor(entry.name) !== null;
              if (!keep) skipped += 1;
              return keep;
            },
          },
          (error, entries) => {
            if (error) {
              reject(error);
              return;
            }
            const images = Object.entries(entries).map(([path, data]) => ({
              file: new File([new Uint8Array(data)], baseName(path), { type: imageTypeFor(path) ?? "" }),
              name: `${file.name}/${path}`,
            }));
            resolve({ images, skipped });
          },
        );
      }),
  );
}

export async function collectFromFiles(files: readonly File[]): Promise<CollectResult> {
  const result: CollectResult = { images: [], skipped: 0, brokenZips: 0 };
  for (const file of files) {
    // Folder picks carry the folder-relative path.
    const path = file.webkitRelativePath || file.name;
    if (isJunkPath(path)) continue;
    if (isZip(file)) {
      try {
        const zip = await extractZip(file);
        result.images.push(...zip.images);
        result.skipped += zip.skipped;
      } catch {
        result.brokenZips += 1;
      }
    } else if (imageTypeFor(file.name)) {
      result.images.push({ file, name: path });
    } else {
      result.skipped += 1;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Drag and drop, including whole folders (via the entries API).
// ---------------------------------------------------------------------------

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

function isDirectoryEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readAllEntries(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const all: FileSystemEntry[] = [];
  // readEntries returns results in batches until an empty one.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function filesFromEntry(entry: FileSystemEntry, prefix: string): Promise<Array<{ file: File; path: string }>> {
  if (isFileEntry(entry)) return [{ file: await fileFromEntry(entry), path: `${prefix}${entry.name}` }];
  if (isDirectoryEntry(entry)) {
    const children = await readAllEntries(entry);
    const nested = await Promise.all(children.map((child) => filesFromEntry(child, `${prefix}${entry.name}/`)));
    return nested.flat();
  }
  return [];
}

export async function collectFromDataTransfer(dataTransfer: DataTransfer): Promise<CollectResult> {
  // Entries must be read synchronously inside the drop handler, before any await.
  const entries = Array.from(dataTransfer.items)
    .map((item) => (item.kind === "file" ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (entries.length === 0) return collectFromFiles(Array.from(dataTransfer.files));

  const found = (await Promise.all(entries.map((entry) => filesFromEntry(entry, "")))).flat();
  const result: CollectResult = { images: [], skipped: 0, brokenZips: 0 };
  for (const { file, path } of found) {
    if (isJunkPath(path)) continue;
    if (isZip(file)) {
      const zip = await collectFromFiles([file]);
      result.images.push(...zip.images);
      result.skipped += zip.skipped;
      result.brokenZips += zip.brokenZips;
    } else if (imageTypeFor(file.name)) {
      result.images.push({ file, name: path });
    } else {
      result.skipped += 1;
    }
  }
  return result;
}
