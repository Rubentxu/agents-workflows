/**
 * ProjectsPage — /studio/projects
 * Lists all projects.
 */
export function ProjectsPage() {
  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold text-text-primary mb-4">Projects</h1>
      <div className="space-y-2">
        <a
          href="/studio/projects/app"
          className="block p-4 border border-border-default rounded-lg hover:border-accent transition-colors"
        >
          <div className="font-medium text-text-primary">app</div>
          <div className="text-sm text-text-muted mt-1">Default project</div>
        </a>
      </div>
    </div>
  );
}
