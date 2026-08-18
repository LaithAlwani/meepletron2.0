import { redirect } from "next/navigation";

// Launched: the root now goes straight to the library. (The old "coming soon"
// splash is preserved in git history if it's ever needed again.)
export default function Home() {
  redirect("/boardgames");
}
