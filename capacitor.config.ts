import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.travelyt.travelyt",
  appName: "Travelyt",
  webDir: "public",
  server: {
    url: "https://travelyt.us",
    cleartext: false,
    androidScheme: "https",
    errorPath: "offline.html",
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
