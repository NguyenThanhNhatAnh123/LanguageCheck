import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { collectFromFiles, imageTypeFor } from "./collect-files";

const bytes = new Uint8Array([1, 2, 3]);

describe("imageTypeFor", () => {
  it("recognizes image extensions case-insensitively", () => {
    expect(imageTypeFor("a.JPG")).toBe("image/jpeg");
    expect(imageTypeFor("a.png")).toBe("image/png");
    expect(imageTypeFor("a.webp")).toBe("image/webp");
    expect(imageTypeFor("a.gif")).toBeNull();
    expect(imageTypeFor("README")).toBeNull();
  });
});

describe("collectFromFiles", () => {
  it("keeps images, skips other files and hidden files", async () => {
    const result = await collectFromFiles([
      new File([bytes], "a.png", { type: "image/png" }),
      new File([bytes], "notes.txt", { type: "text/plain" }),
      new File([bytes], ".DS_Store"),
    ]);
    expect(result.images.map((image) => image.name)).toEqual(["a.png"]);
    expect(result.skipped).toBe(1);
  });

  it("extracts images from a zip, skipping junk entries", async () => {
    const zip = zipSync({
      "designs/gonna.png": bytes,
      "designs/sub/de-error.JPG": bytes,
      "designs/readme.txt": bytes,
      "__MACOSX/designs/._gonna.png": bytes,
      "designs/.hidden.png": bytes,
    });
    const result = await collectFromFiles([new File([new Uint8Array(zip)], "batch.zip", { type: "application/zip" })]);
    expect(result.images.map((image) => image.name).sort()).toEqual(["batch.zip/designs/gonna.png", "batch.zip/designs/sub/de-error.JPG"]);
    expect(result.images.map((image) => image.file.type).sort()).toEqual(["image/jpeg", "image/png"]);
    expect(result.skipped).toBe(3);
    expect(result.brokenZips).toBe(0);
  });

  it("counts a corrupt zip instead of throwing", async () => {
    const result = await collectFromFiles([new File([bytes], "broken.zip", { type: "application/zip" })]);
    expect(result).toEqual({ images: [], skipped: 0, brokenZips: 1 });
  });
});
