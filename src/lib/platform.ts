/** Things that behave differently on iOS, iPadOS and macOS, kept in one place. */

export async function saveFile(name: string, text: string, mime = 'application/json'): Promise<'shared' | 'saved' | 'cancel'> {
  const file = new File([text], name, { type: mime });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'cancel';
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}

export function notifySupported(): boolean {
  return typeof Notification !== 'undefined';
}

export async function askNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notifySupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export async function notify(title: string, body: string): Promise<boolean> {
  if (!notifySupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { body, icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, tag: 'mattana-vita' });
      return true;
    }
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}

export async function keepAwake(): Promise<() => void> {
  try {
    const wl = await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen');
    return () => void wl?.release().catch(() => undefined);
  } catch {
    return () => undefined;
  }
}

export function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.75);
    setTimeout(() => void ctx.close(), 900);
  } catch {
    /* audio not available */
  }
}

export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/** On iPhone and iPad the Home Screen app keeps its own storage: the code has to be entered there, not in the Safari tab. */
export function needsInstall(): boolean {
  return (isIOS && !isStandalone()) || new URLSearchParams(location.search).has('install-help');
}
