import { redirect } from "next/navigation";

// Settings lives in Home now, as its third tab; keep old links working.
export default function SettingsRedirect() {
  redirect("/discover?tab=settings");
}
