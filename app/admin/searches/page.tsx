"use client";

import { useQuery, useMutation } from "convex/react";
import { Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";
import { relativeTime } from "@/lib/format";
import { friendlyError } from "@/lib/friendlyError";

export default function AdminSearchesPage() {
  const searches = useQuery(api.search.topSearches);
  const clear = useMutation(api.search.clearSearches);
  const confirm = useConfirm();
  const toast = useToast();

  async function clearAll() {
    const ok = await confirm({
      title: "Delete all searches?",
      message:
        "This permanently clears every logged search term. This can't be undone.",
      confirmText: "Delete all",
      danger: true,
    });
    if (!ok) return;
    try {
      await clear({});
      toast("Searches cleared", "success");
    } catch (e) {
      toast(friendlyError(e, "Couldn't clear searches"), "error");
    }
  }

  if (searches === undefined) return <p className="text-muted">Loading…</p>;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Recent searches</h2>
        {searches.length > 0 && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete all
          </button>
        )}
      </div>
      {searches.length === 0 ? (
        <p className="text-muted">No searches logged yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Query</th>
                <th className="px-3 py-2 font-medium">Last searched</th>
                <th className="px-3 py-2 text-right font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {searches.map((s) => (
                <tr key={s._id} className="border-t border-border">
                  <td className="px-3 py-2">{s.query}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted">
                    {relativeTime(s.lastSearchedAt ?? s._creationTime)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
