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
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
