import { continueRender, delayRender, staticFile } from 'remotion';

/**
 * Loads the product's own font files before the first frame renders, so no frame
 * is ever drawn in a fallback face. The files are the editor's (public/fonts is a
 * link to apps/editor/public/fonts).
 */
const FACES: [family: string, file: string, descriptors: FontFaceDescriptors][] = [
  ['Archivo', 'fonts/Archivo-Variable.woff2', { weight: '400 900' }],
  ['Instrument Serif', 'fonts/InstrumentSerif-Regular.woff2', { weight: '400' }],
  ['IBM Plex Mono', 'fonts/IBMPlexMono-Regular.woff2', { weight: '400' }],
];

let loading: Promise<void> | null = null;

export function loadBrandFonts(): void {
  if (loading) return;
  const handle = delayRender('Loading brand fonts');
  loading = Promise.all(FACES.map(async ([family, file, descriptors]) => {
    const face = new FontFace(family, `url(${staticFile(file)})`, descriptors);
    await face.load();
    document.fonts.add(face);
  })).then(() => continueRender(handle));
}
