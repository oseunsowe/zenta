// Safe accessor for the Electron desktop bridge (window.__host). In a normal
// browser this is absent, so every call no-ops and `isDesktop()` is false.

interface KeyModifiers {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export type ControlEvent =
  | { type: 'move' | 'down' | 'up' | 'click' | 'dblclick'; x: number; y: number; button?: number }
  // dy/dx are scroll notches, NOT raw pixel deltas — see wheelNotches() in
  // ViewPanel. The host injects these numbers directly as scroll units.
  | { type: 'wheel'; x: number; y: number; dy: number; dx?: number }
  // Held keys: the host presses on keydown and releases on keyup, so modifiers
  // can be combined with the mouse.
  | ({ type: 'keydown' | 'keyup'; key: string; code?: string } & KeyModifiers)
  // Release everything the host is holding (viewer lost focus or disconnected).
  | { type: 'keyreset' }
  // Legacy press-and-release in one event; still used by the quick actions.
  | ({ type: 'key'; key: string; code?: string } & KeyModifiers);

interface HostBridge {
  desktop?: boolean;
  remoteControlAvailable?: () => boolean;
  setRemoteControl?: (enabled: boolean) => void;
  sendRemoteInput?: (event: ControlEvent) => void;
  onShowSecureLogin?: (cb: () => void) => void;
  removeShowSecureLogin?: (cb: () => void) => void;
}

function host(): HostBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { __host?: HostBridge }).__host ?? null;
}

/** True when running inside the Zenta desktop app. */
export function isDesktop(): boolean {
  return !!host()?.desktop;
}

/** True only when the desktop app's native input module loaded successfully. */
export function remoteControlAvailable(): boolean {
  try {
    return !!host()?.remoteControlAvailable?.();
  } catch {
    return false;
  }
}

export function setRemoteControl(enabled: boolean): void {
  host()?.setRemoteControl?.(enabled);
}

export function applyRemoteInput(event: ControlEvent): void {
  host()?.sendRemoteInput?.(event);
}
