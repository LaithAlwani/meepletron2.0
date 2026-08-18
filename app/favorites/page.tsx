import { redirect } from "next/navigation";

// Favourites folded into the collection, which now lives in the library. Keep
// the route so old links / bookmarks still land somewhere sensible.
export default function FavoritesPage() {
  redirect("/boardgames");
}
