import { headers } from "next/headers";
import { getAdminSession } from "@/lib/admin-auth";

export async function getAdminSessionFromServerHeaders() {
  const headerStore = await headers();
  return getAdminSession(
    new Request("https://travelyt.us/internal", {
      headers: {
        cookie: headerStore.get("cookie") ?? "",
      },
    })
  );
}
