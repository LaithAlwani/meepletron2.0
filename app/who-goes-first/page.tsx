import { redirect } from "next/navigation";

// Renamed to "First player". Keep the old URL alive for shared/old links.
export default function WhoGoesFirstRedirect() {
  redirect("/first-player");
}
