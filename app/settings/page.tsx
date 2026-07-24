import { redirect } from "next/navigation";

// The Settings tab became the Menu hub; keep old links working.
export default function SettingsRedirect() {
  redirect("/menu");
}
