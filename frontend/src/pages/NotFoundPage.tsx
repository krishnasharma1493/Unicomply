import React from 'react';
import { Link } from 'react-router-dom';

/** Any unknown address: say so plainly and offer the way home. */
export const NotFoundPage: React.FC = () => {
  React.useEffect(() => {
    document.title = 'Page not found · Unicomply';
  }, []);
  return (
  <main className="uc-login" style={{ alignItems: 'center' }}>
    <div className="uc-login-col" style={{ maxWidth: '28rem', textAlign: 'center' }}>
      <p className="uc-label" style={{ margin: '0 auto 12px' }}>404</p>
      <h1 style={{ margin: 0, fontSize: '1.75rem', letterSpacing: '-0.025em' }}>Page not found</h1>
      <p className="uc-page-subtitle" style={{ margin: '8px auto 20px' }}>
        Sorry, the page you visited does not exist. Check the address, or go back to your work.
      </p>
      <Link to="/" className="ant-btn ant-btn-primary ant-btn-color-primary ant-btn-variant-solid uc-link-button">
        Back to Today
      </Link>
    </div>
  </main>
  );
};

export default NotFoundPage;
