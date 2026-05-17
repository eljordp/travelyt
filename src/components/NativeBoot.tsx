"use client";

import { useEffect } from "react";
import { isNative, registerPush } from "@/lib/native";

export default function NativeBoot() {
  useEffect(() => {
    if (!isNative()) return;

    let cancelled = false;

    (async () => {
      const ok = await registerPush({
        onToken: (token) => {
          if (cancelled) return;
          fetch("/api/push-tokens", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, platform: "ios" }),
          }).catch((err) => console.warn("token register failed", err));
        },
        onNotification: (n) => {
          console.log("Push received in foreground", n.title, n.body);
        },
        onTap: (a) => {
          const bookingId = a.notification.data?.bookingId;
          if (bookingId && typeof window !== "undefined") {
            window.location.href = `/booking/${bookingId}`;
          }
        },
      });
      if (!ok) console.log("Push permission denied or unavailable");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
