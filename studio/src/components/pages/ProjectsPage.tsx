/**
 * ProjectsPage — /studio/projects
 * Lists all projects.
 */
export function ProjectsPage() {
  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold text-on-surface mb-4">Projects</h1>
      <div className="space-y-2">
        <a
          href="/studio/projects/app"
          className="block p-4 border border-outline rounded-lg hover:border-primary transition-colors"
        >
          <div className="font-medium text-on-surface">app</div>
          <div className="text-sm text-secondary mt-1">Default project</div>
        </a>
      </div>
    </div>
  );
}
