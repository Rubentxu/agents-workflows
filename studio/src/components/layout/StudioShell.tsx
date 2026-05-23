import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { useTheme } from '@/hooks/useTheme';

interface ShellContextValue {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellContextValue>({
  sidebarCollapsed: false,
  toggleSidebar: () => {},
  mobileMenuOpen: false,
  setMobileMenuOpen: () => {},
});

export function useShellContext() {
  return useContext(ShellContext);
}

export function StudioShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('studio-sidebar-collapsed') === 'true';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useTheme();

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('studio-sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      const handler = () => setMobileMenuOpen(false);
      window.addEventListener('resize', handler);
      return () => window.removeEventListener('resize', handler);
    }
  }, [mobileMenuOpen]);

  return (
    <ShellContext.Provider value={{ sidebarCollapsed, toggleSidebar, mobileMenuOpen, setMobileMenuOpen }}>
      <div
        className={`app-shell${sidebarCollapsed ? ' app-shell--collapsed' : ''}`}
      >
        <TopBar />
        {mobileMenuOpen && (
          <div
            className="app-shell__sidebar-overlay app-shell__sidebar-overlay--visible"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        <div className="app-shell__main">
          <Outlet />
        </div>
      </div>
    </ShellContext.Provider>
  );
}
