import { redirect } from "next/navigation";

// The collection now lives inside the library (/boardgames). Keep this path as a
// redirect so old links / bookmarks don't 404.
export default function CollectionRedirect() {
  redirect("/boardgames");
}
