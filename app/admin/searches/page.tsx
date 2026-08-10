"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function AdminSearchesPage() {
  const searches = useQuery(api.search.topSearches);

  if (searches === undefined) return <p className="text-muted">Loading…</p>;

  return (
    <div>
      <h2 className="mb-3 font-display text-lg font-bold">Top searches</h2>
      {searches.length === 0 ? (
        <p className="text-muted">No searches logged yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Query</th>
                <th className="px-3 py-2 text-right font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {searches.map((s) => (
                <tr key={s._id} className="border-t border-border">
                  <td className="px-3 py-2">{s.query}</td>
                  <td className="px-3 py-2 text-right">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
