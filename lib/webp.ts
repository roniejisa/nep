export type ImagePreset = 'compact' | 'balanced' | 'sharp';
export type ConvertedImage = { id: string; blob: Blob; preview: string; name: string; originalBytes: number; width: number; height: number };
export const imagePresets = {
  compact: { edge: 1200, quality: .8, target: 250 * 1024, label: 'Gọn nhẹ', detail: '1.200 px · chất lượng 80%' },
  balanced: { edge: 1600, quality: .84, target: 450 * 1024, label: 'Cân bằng', detail: '1.600 px · chất lượng 84%' },
  sharp: { edge: 2200, quality: .9, target: 850 * 1024, label: 'Nét hơn', detail: '2.200 px · chất lượng 90%' },
};
const MAX_UPLOAD = 2 * 1024 * 1024;
export async function convertWebP(file: File, preset: ImagePreset): Promise<ConvertedImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`${file.name}: chỉ nhận JPG, PNG hoặc WebP.`);
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: ảnh gốc vượt 20 MB.`);
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const config = imagePresets[preset];
  const canvas = document.createElement('canvas');
  try {
    if (bitmap.width * bitmap.height > 60_000_000) throw new Error(`${file.name}: ảnh vượt 60 megapixel. Vui lòng chọn ảnh nhỏ hơn.`);
    const ratio = Math.min(1, config.edge / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encode = (quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không thể chuyển đổi ảnh.')), 'image/webp', quality));
    let quality = config.quality;
    let blob = await encode(quality);
    if (blob.type !== 'image/webp') throw new Error('Trình duyệt chưa hỗ trợ xuất WebP. Hãy sử dụng Chrome, Edge, Firefox hoặc Safari bản mới.');
    // Size targets are best effort; prioritize legibility over aggressive degradation.
    while (blob.size > config.target && quality > .72) {
      quality = Math.max(.72, quality - .04);
      blob = await encode(quality);
    }
    if (blob.size > MAX_UPLOAD) throw new Error(`${file.name}: ảnh WebP vẫn vượt 2 MB. Chọn chế độ Gọn nhẹ rồi thử lại.`);
    const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (String.fromCharCode(...header.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...header.slice(8, 12)) !== 'WEBP') throw new Error('Dữ liệu ảnh đầu ra không phải WebP hợp lệ.');
    return { id: crypto.randomUUID(), blob, preview: URL.createObjectURL(blob), name: file.name.replace(/\.[^.]+$/, '') + '.webp', originalBytes: file.size, width: canvas.width, height: canvas.height };
  } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
}
