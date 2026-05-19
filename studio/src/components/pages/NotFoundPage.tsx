/**
 * NotFoundPage — catch-all 404 page.
 */
export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="text-6xl font-bold text-secondary mb-4">404</div>
      <h1 className="text-xl font-semibold text-on-surface mb-2">Page not found</h1>
      <p className="text-sm text-secondary mb-6">
        The page you are looking for does not exist.
      </p>
      <a
        href="/studio"
        className="px-4 py-2 bg-primary text-on-primary text-sm font-medium rounded hover:bg-primary/90 transition-colors"
      >
        Go to Studio
      </a>
    </div>
  );
}
