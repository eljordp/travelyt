"use client";

import { useEffect } from "react";
import { installPushNavigationHandlers, isNative } from "@/lib/native";

export default function NativeBoot() {
  useEffect(() => {
    if (!isNative()) return;

    let cancelled = false;

    (async () => {
      await installPushNavigationHandlers();
      if (!cancelled) console.log("Native notification routing ready");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
