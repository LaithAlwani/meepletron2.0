"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function AdminRequestsPage() {
  const requests = useQuery(api.rulebookRequests.listRequests);

  if (requests === undefined) return <p className="text-muted">Loading…</p>;

  return (
    <div>
      <h2 className="mb-1 font-display text-lg font-bold">Rulebook requests</h2>
      <p className="mb-3 text-sm text-muted">
        Games players want ingested, most-requested first. A game drops off once
        it has an ingested rulebook.
      </p>
      {requests.length === 0 ? (
        <p className="text-muted">No pending requests.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Game</th>
                <th className="px-3 py-2 text-right font-medium">Requests</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.gameId} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/boardgames/${r.gameId}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      {r.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.thumbUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 shrink-0 rounded bg-surface-2" />
                      )}
                      <span className="font-medium">{r.title}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {r.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
