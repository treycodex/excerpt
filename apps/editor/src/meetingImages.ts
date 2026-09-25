import type { MeetingImage } from '@excerpt/types';

/** Decode and re-encode raster images locally; never persist arbitrary clipboard HTML. */
export async function readMeetingImage(file: File, at: number, capturedAt = new Date().toISOString(), origin: MeetingImage['origin'] = 'import'): Promise<MeetingImage> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Could not read this image.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { id: crypto.randomUUID(), dataUrl: canvas.toDataURL('image/jpeg', 0.9), at: Math.max(0, at), capturedAt, caption: '', origin };
  } finally { URL.revokeObjectURL(url); }
}
