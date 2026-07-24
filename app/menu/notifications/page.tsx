import { redirect } from "next/navigation";

// Notification preferences merged into Settings; keep old links working.
export default function NotificationsRedirect() {
  redirect("/menu/settings");
}
