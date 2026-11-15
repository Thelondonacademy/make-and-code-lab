// Manda il programma al micro:bit vero con il cavo USB (WebUSB, Chrome ed Edge sul computer).
// Libreria open source della Micro:bit Educational Foundation (@microbit/microbit-connection, MIT).
import { createUSBConnection } from '@microbit/microbit-connection/usb';
import { createUniversalHexFlashDataSource } from '@microbit/microbit-connection/universal-hex';

export const usbSupported = () => typeof navigator !== 'undefined' && 'usb' in navigator;

let usb: ReturnType<typeof createUSBConnection> | null = null;

export async function flashHex(hex: string, progress: (pct: number, stage: string) => void): Promise<void> {
  if (!usbSupported()) throw new Error('nousb');
  if (!usb) usb = createUSBConnection();
  await usb.flash(createUniversalHexFlashDataSource(hex), {
    partial: true,
    progress: (stage: any, pct?: number) => progress(Math.round((pct ?? 0) * 100), String(stage)),
  });
}

export function saveHexFile(hex: string, name: string) {
  const blob = new Blob([hex], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (name || 'make-and-code-lab').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.hex';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
