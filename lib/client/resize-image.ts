// Browser-only: shrink a mockup before upload (longest side ≤ 1000px, JPEG ~0.85).

export const UPLOAD_MAX_SIDE = 1000;
export const UPLOAD_JPEG_QUALITY = 0.85;

// JPEG has no transparency. Flattening a transparent PNG onto white would erase white text
// (common on designs for dark shirts) and black would erase black text; mid-gray keeps both
// readable.
const TRANSPARENT_BACKGROUND = "#808080";

export async function resizeImageForUpload(
  file: Blob,
  maxSide: number = UPLOAD_MAX_SIDE,
  quality: number = UPLOAD_JPEG_QUALITY,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D is not available");

    context.drawImage(bitmap, 0, 0, width, height);
    if (hasTransparency(context, width, height)) {
      // Repaint with the background underneath the image.
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = TRANSPARENT_BACKGROUND;
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "source-over";
    }

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode JPEG"))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    bitmap.close();
  }
}

function hasTransparency(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = context.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}
