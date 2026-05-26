/**
 * Studio application root.
 * Replaces the old single-page layout with a router-based shell.
 */

import { RouterProvider } from 'react-router-dom';
import { createStudioRouter } from '@/router';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from 'react-hot-toast';

export default function App() {
  const router = createStudioRouter();
  return (
    <ErrorBoundary>
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      <RouterProvider router={router} />
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid var(--color-outline-variant)',
          },
        }}
      />
    </ErrorBoundary>
  );
}
