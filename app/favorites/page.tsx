import { redirect } from "next/navigation";

// Favourites folded into the unified Collection (wishlist tab). Keep the route
// so old links / bookmarks still land somewhere sensible.
export default function FavoritesPage() {
  redirect("/collection");
}
