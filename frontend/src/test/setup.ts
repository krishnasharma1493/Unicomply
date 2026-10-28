import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// The page tests run in parallel and render Ant Design; the default 1 s wait for async UI is too tight under load.
configure({ asyncUtilTimeout: 5000 });

// Polyfill window.matchMedia for Ant Design in jsdom environment
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Polyfill ResizeObserver for Ant Design components (Table, Layout, Menu) in jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = MockResizeObserver;
global.ResizeObserver = MockResizeObserver;
