// Demo trade-off: memory first, sessionStorage as backup so a page reload mid-demo
// doesn't log you out. sessionStorage is per-tab and cleared when the tab closes.
const KEY = 'unicomply_access_token';
let memory: string | null = null;

export const tokenStore = {
  get: (): string | null => {
    if (memory) return memory;
    try {
      memory = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KEY) : null;
    } catch {
      memory = null;
    }
    return memory;
  },
  set: (token: string) => {
    memory = token;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(KEY, token);
      }
    } catch {
      /* storage blocked — memory still works */
    }
  },
  clear: () => {
    memory = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(KEY);
      }
    } catch {
      /* ignore */
    }
  },
};
