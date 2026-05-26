/**
 * DirtyGuardDialog — Modal shown when user tries to navigate away from a dirty editor.
 * Offers three options: Stay (cancel), Discard (proceed without saving), Save & Leave.
 */
import { Button } from '@/components/primitives/Button';

export interface DirtyGuardDialogProps {
  /** Called when user clicks "Stay" — cancel navigation */
  onStay: () => void;
  /** Called when user clicks "Discard changes" — proceed without saving */
  onDiscard: () => void;
  /** Called when user clicks "Save & leave" — save then proceed */
  onSaveAndLeave?: () => void;
}

export function DirtyGuardDialog({
  onStay,
  onDiscard,
  onSaveAndLeave,
}: DirtyGuardDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dirty-dialog-title"
    >
      <div className="bg-surface-container rounded-lg shadow-xl border border-outline-variant p-6 max-w-sm w-full mx-4">
        <h2
          id="dirty-dialog-title"
          className="text-lg font-semibold text-on-surface mb-2"
        >
          Unsaved changes
        </h2>
        <p className="text-sm text-secondary mb-4">
          You have unsaved changes. What would you like to do?
        </p>
        <div className="flex flex-col gap-2">
          {onSaveAndLeave && (
            <Button variant="primary" size="md" onClick={onSaveAndLeave}>
              Save &amp; leave
            </Button>
          )}
          <Button variant="secondary" size="md" onClick={onDiscard}>
            Discard changes
          </Button>
          <Button variant="ghost" size="md" onClick={onStay}>
            Stay
          </Button>
        </div>
      </div>
    </div>
  );
}
