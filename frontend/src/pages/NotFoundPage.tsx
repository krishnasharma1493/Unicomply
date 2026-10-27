import React from 'react';
import { Result, Button } from 'antd';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div
      role="main"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        padding: '24px',
      }}
    >
      <Result
        status="404"
        title="404"
        subTitle="Sorry, the page you visited does not exist."
        extra={
          <Link to="/">
            <Button type="primary">Back to Dashboard</Button>
          </Link>
        }
      />
    </div>
  );
};
