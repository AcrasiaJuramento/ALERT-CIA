const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);
const DEFAULT_MAX_WIDTH = 1100;
const DEFAULT_MAX_BYTES = 500 * 1024;
const DEFAULT_JPEG_QUALITY = 0.82;

function loadImageFromObjectUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load advisory image.'));
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to compress advisory image.'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

export async function compressAdvisoryImage(file, {
  maxWidth = DEFAULT_MAX_WIDTH,
  maxBytes = DEFAULT_MAX_BYTES,
  jpegQuality = DEFAULT_JPEG_QUALITY,
} = {}) {
  if (!ALLOWED_IMAGE_TYPES.has(file?.type)) {
    throw new Error('Only JPG and PNG advisory images are supported.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromObjectUrl(objectUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scale = Math.min(1, maxWidth / Math.max(sourceWidth, 1));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);

    const outputType = file.type === 'image/png' && file.size <= maxBytes ? 'image/png' : 'image/jpeg';
    const blob = await canvasToBlob(canvas, outputType, outputType === 'image/jpeg' ? jpegQuality : undefined);

    if (blob.size > maxBytes) {
      throw new Error(`Compressed image is still larger than ${Math.round(maxBytes / 1024)} KB. Choose a smaller image.`);
    }

    return {
      blob,
      fileName: outputType === file.type ? file.name : file.name.replace(/\.[^.]+$/, '.jpg'),
      mimeType: outputType,
      sizeBytes: blob.size,
      width,
      height,
      previewUrl: URL.createObjectURL(blob),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
