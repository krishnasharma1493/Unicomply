import { message } from 'antd';

const REGION_ID = 'uc-announcer';

/** Say something to screen readers without moving focus (a polite live region in the app root). */
export function announce(text: string) {
  const el = typeof document !== 'undefined' ? document.getElementById(REGION_ID) : null;
  if (!el) return;
  el.textContent = '';
  // A fresh node change makes repeated messages announce again.
  window.setTimeout(() => {
    el.textContent = text;
  }, 30);
}

let installed = false;

/**
 * Ant Design's toasts are visual only. Mirror every toast into the live region so a success or error
 * is heard as well as seen. Installed once at start-up.
 */
export function installToastAnnouncer() {
  if (installed) return;
  installed = true;
  for (const kind of ['success', 'error', 'info', 'warning'] as const) {
    const original = message[kind].bind(message);
    (message as unknown as Record<string, unknown>)[kind] = (content: unknown, ...rest: unknown[]) => {
      if (typeof content === 'string') announce(content);
      else if (content && typeof content === 'object' && 'content' in content && typeof (content as { content: unknown }).content === 'string') {
        announce((content as { content: string }).content);
      }
      return (original as (...a: unknown[]) => unknown)(content, ...rest);
    };
  }
}

export const ANNOUNCER_ID = REGION_ID;
