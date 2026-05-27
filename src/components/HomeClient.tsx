"use client";

import { useEffect, useState } from "react";
import AppHome from "@/components/AppHome";
import WebsiteHome from "@/components/WebsiteHome";
import { isNative } from "@/lib/native";

export default function HomeClient() {
  const [native, setNative] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setNative(isNative() || params.has("app"));
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  return native ? <AppHome /> : <WebsiteHome />;
}
