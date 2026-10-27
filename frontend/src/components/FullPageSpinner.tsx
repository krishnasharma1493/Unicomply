import { Spin } from 'antd';

export function FullPageSpinner({ tip = 'Loading Unicomply...' }: { tip?: string }) {
  return (
    <div
      role="status"
      aria-label={tip}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100%',
        gap: '16px',
        backgroundColor: '#f8fafc',
      }}
    >
      <Spin size="large" />
      <span style={{ color: '#475569', fontSize: '14px', fontWeight: 500 }}>{tip}</span>
    </div>
  );
}
