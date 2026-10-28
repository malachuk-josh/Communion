import { redirect } from "next/navigation";

// Settings moved into Home as its third tab; keep old links working.
export default function SettingsPage() {
  redirect("/discover?tab=settings");
}
