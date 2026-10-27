import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Layout, Drawer } from 'antd';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';

const { Sider, Content } = Layout;

export const AppShell: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Top Header */}
      <AppHeader
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        isMobile={isMobile}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
      />

      <Layout style={{ minHeight: 'calc(100vh - 60px)' }}>
        {/* Desktop Collapsible Sider */}
        {!isMobile && (
          <Sider
            trigger={null}
            collapsible
            collapsed={collapsed}
            width={220}
            collapsedWidth={64}
            style={{
              backgroundColor: '#0f172a',
              boxShadow: '1px 0 2px 0 rgba(0, 0, 0, 0.05)',
              overflow: 'auto',
              height: 'calc(100vh - 60px)',
              position: 'sticky',
              top: 60,
              left: 0,
            }}
          >
            <AppSidebar collapsed={collapsed} />
          </Sider>
        )}

        {/* Mobile Navigation Drawer */}
        {isMobile && (
          <Drawer
            title="Navigation"
            placement="left"
            onClose={() => setMobileMenuOpen(false)}
            open={mobileMenuOpen}
            styles={{
              body: { padding: 0, backgroundColor: '#0f172a' },
              header: { backgroundColor: '#0f172a', color: '#ffffff', borderBottom: '1px solid #1e293b' },
            }}
            width={260}
          >
            <AppSidebar onNavigate={() => setMobileMenuOpen(false)} />
          </Drawer>
        )}

        {/* Main Content Area */}
        <Content
          style={{
            padding: isMobile ? '16px' : '24px 32px',
            backgroundColor: '#f8fafc',
            maxWidth: '1440px',
            width: '100%',
            margin: '0 auto',
            minHeight: '280px',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppShell;
