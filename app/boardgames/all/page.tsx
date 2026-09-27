import { redirect } from "next/navigation";

// The library (/boardgames) now shows the full catalogue with infinite scroll,
// so the separate "all" page is gone. Keep the path as a redirect (preserving a
// search term) so old links / bookmarks don't 404.
export default async function AllBoardgamesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  redirect(q ? `/boardgames?q=${encodeURIComponent(q)}` : "/boardgames");
}
