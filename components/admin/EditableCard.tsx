"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

/**
 * A titled admin card that shows a read-only view by default with an Edit
 * button; clicking Edit swaps in the editor. `renderEdit` receives a `done`
 * callback to return to the read view (call it after a successful save, or on
 * cancel). The editor is only mounted while editing, so cancelling discards the
 * draft and the read view re-reads the freshly saved data.
 */
export function EditableCard({
  title,
  view,
  renderEdit,
}: {
  title: string;
  view: React.ReactNode;
  renderEdit: (done: () => void) => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="rounded-2xl border border-border-muted bg-surface p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold">{title}</h3>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
      </div>
      {editing ? renderEdit(() => setEditing(false)) : view}
    </section>
  );
}
