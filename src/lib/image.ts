/**
 * Reduz uma foto do celular para guardar no banco (data URL JPEG):
 * lado maior até `max` px e qualidade `quality` ⇒ ~60–150 KB em vez de vários MB.
 * Respeita a orientação EXIF (createImageBitmap com imageOrientation: 'from-image').
 */
export async function compressImage(file: File, max = 1024, quality = 0.7): Promise<string> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('image');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  return canvas.toDataURL('image/jpeg', quality);
}
