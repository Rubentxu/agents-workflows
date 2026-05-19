/**
 * Studio application root.
 * Replaces the old single-page layout with a router-based shell.
 */

import { RouterProvider } from 'react-router-dom';
import { createStudioRouter } from '@/router';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function App() {
  const router = createStudioRouter();
  return (
    <ErrorBoundary>
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
