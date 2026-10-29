import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { env } from './lib/env';
import { registerMockAdapter } from './lib/api/client';
import { installToastAnnouncer } from './lib/announce';
import './index.css';

async function bootstrap() {
  installToastAnnouncer();
  // Issue #10: attach the mock API before the first request; never loaded when mocks are off.
  if (env.VITE_USE_MOCKS) {
    const { attachMockAdapter } = await import('./lib/api/mock');
    registerMockAdapter(attachMockAdapter);
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
