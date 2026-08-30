import { headers } from "next/headers";
import { getVerifiedAdminSession } from "@/lib/admin-auth";

export async function getAdminSessionFromServerHeaders() {
  const headerStore = await headers();
  return getVerifiedAdminSession(
    new Request("https://travelyt.us/internal", {
      headers: {
        cookie: headerStore.get("cookie") ?? "",
      },
    })
  );
}
