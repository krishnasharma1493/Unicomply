import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Drawer } from 'antd';
import { motion } from 'motion/react';
import { useMotionPrefs } from '../../lib/motion';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { CommandBar, useCommandShortcut } from './CommandBar';

const MOBILE_QUERY = '(max-width: 767px)';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/**
 * The floating control layer (glass sidebar and toolbar) over one canvas. Content scrolls underneath;
 * the toolbar shows its edge only once something is behind it.
 */
export const AppShell: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const motionPrefs = useMotionPrefs();
  const location = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);
  const openCommand = useCallback(() => setCommandOpen(true), []);
  useCommandShortcut(openCommand);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A new page starts at the top, the way a new window would. The tab title follows the page's h1,
  // and when the user navigated from the chrome (sidebar, command bar, toolbar) focus moves to that h1
  // so keyboard and screen-reader users land on the new content, not back at the top of the nav.
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    window.scrollTo?.(0, 0);
    const main = document.getElementById('main');
    if (!main) return;
    const fromChrome = () => {
      const a = document.activeElement;
      return !a || a === document.body || Boolean(a.closest('.uc-sidebar-col, .uc-toolbar, .uc-command, .ant-drawer'));
    };
    // Only after a real navigation inside the app (StrictMode re-runs effects on the same path).
    const shouldFocus = lastPath.current !== null && lastPath.current !== location.pathname && fromChrome();
    lastPath.current = location.pathname;
    let focused = false;
    const sync = () => {
      const h1 = main.querySelector('h1');
      if (!h1) return;
      document.title = `${h1.textContent?.trim() || 'Unicomply'} · Unicomply`;
      if (shouldFocus && !focused) {
        focused = true;
        h1.setAttribute('tabindex', '-1');
        h1.focus({ preventScroll: true });
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [location.pathname]);

  return (
    <div
      className="uc-shell"
      data-collapsed={!isMobile && collapsed ? 'true' : 'false'}
      data-mobile={isMobile ? 'true' : 'false'}
    >
      <a className="uc-skip" href="#main">
        Skip to content
      </a>
      {!isMobile && (
        <aside className="uc-sidebar-col" aria-label="Primary">
          <div className="uc-sidebar">
            <AppSidebar collapsed={collapsed} />
          </div>
        </aside>
      )}

      {isMobile && (
        <Drawer
          title="Unicomply"
          placement="left"
          onClose={() => setMobileMenuOpen(false)}
          open={mobileMenuOpen}
          width={280}
          styles={{ body: { padding: '8px 0' } }}
        >
          <AppSidebar onNavigate={() => setMobileMenuOpen(false)} hideBrand />
        </Drawer>
      )}

      <div className="uc-main">
        <AppHeader
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          isMobile={isMobile}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          scrolled={scrolled}
          onOpenCommand={openCommand}
        />
        <main className="uc-content" id="main" tabIndex={-1}>
          <motion.div
            // Moving between cases in the split view is a selection, not a new page: keep it mounted.
            key={/^\/cases\/\d+/.test(location.pathname) ? '/cases' : location.pathname}
            initial={motionPrefs.enter()}
            animate={{ opacity: 1, y: 0 }}
            transition={motionPrefs.spring}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <CommandBar open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
};

export default AppShell;
