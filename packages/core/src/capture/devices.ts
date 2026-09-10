export interface AudioInput {
  deviceId: string;
  label: string;
  /** True for devices that commonly exist but capture nothing on a given Mac:
      Continuity (iPhone) mics and virtual devices installed by other apps. */
  suspect: boolean;
}

const SUSPECT = /iphone|ipad|continuity|virtual|teams audio|aggregate|loopback|blackhole|soundflower/i;

/**
 * Microphones, most-likely-usable first.
 *
 * Labels are only exposed after microphone permission has been granted, so callers
 * should ask for permission before offering a choice.
 */
export async function listMicrophones(): Promise<AudioInput[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices
    .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications')
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || 'Microphone',
      suspect: SUSPECT.test(d.label),
    }));

  // Collapse the duplicate "Default - X" entry Chrome reports alongside X.
  const seen = new Set<string>();
  const unique = inputs.filter((d) => {
    const name = d.label.replace(/^Default\s*[-–]\s*/i, '');
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });

  return unique.sort((a, b) => Number(a.suspect) - Number(b.suspect));
}

/** The device we would pick if the user does not choose. */
export function preferredMicrophone(inputs: AudioInput[]): AudioInput | undefined {
  return inputs.find((d) => !d.suspect) ?? inputs[0];
}
