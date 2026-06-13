import { redirect } from "next/navigation";

export default function BackupIndexPage() {
  redirect("/backup/bookings");
}
