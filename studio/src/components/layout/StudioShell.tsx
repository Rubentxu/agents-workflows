/**
 * StudioShell — the outermost layout wrapper.
 * Provides the top app bar and renders child routes.
 */

import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';

export function StudioShell() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg-base">
      {/* Top app bar */}
      <TopBar />

      {/* Page content */}
      <div className="flex-1 flex overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
