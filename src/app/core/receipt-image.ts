/**
 * Prepara la captura del pago (Plin) para subirla: acepta JPG, PNG, WEBP y HEIC/HEIF
 * (iPhone) de hasta 10 MB y la convierte a un JPG de menos de ~1 MB.
 * Las librerías se cargan solo cuando hacen falta.
 */
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;

/** Foto de jugador para el avatar: WebP de 512 px y menos de 60 KB. */
export const PHOTO_OPTIONS = { maxSizeMB: 0.058, maxWidthOrHeight: 512, fileType: 'image/webp', initialQuality: 0.82 };

export async function prepareReceipt(
  file: File,
  opts: { maxSizeMB: number; maxWidthOrHeight: number; fileType: string; initialQuality: number } = {
    maxSizeMB: 0.9,
    maxWidthOrHeight: 1800,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
  },
): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('La imagen pesa más de 10 MB. Toma una captura de pantalla en vez de una foto.');
  }

  const isHeic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  let input: Blob = file;

  if (isHeic) {
    try {
      const heic2any = (await import('heic2any')).default;
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
      input = Array.isArray(out) ? out[0] : out;
    } catch {
      throw new Error('No pudimos leer la imagen HEIC. Prueba con una captura de pantalla (PNG o JPG).');
    }
  } else if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    throw new Error('Formato no soportado. Sube una imagen JPG, PNG o HEIC.');
  }

  const imageCompression = (await import('browser-image-compression')).default;
  const asFile = input instanceof File ? input : new File([input], 'captura.jpg', { type: input.type || 'image/jpeg' });
  try {
    return await imageCompression(asFile, {
      ...opts,
      // Sin web worker: evita que la librería descargue código de un CDN.
      useWebWorker: false,
    });
  } catch {
    throw new Error('No pudimos procesar la imagen. Intenta con otra captura.');
  }
}
