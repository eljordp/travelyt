"use client";

import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Geolocation, type Position } from "@capacitor/geolocation";
import {
  PushNotifications,
  type PermissionStatus,
  type Token,
  type PushNotificationSchema,
  type ActionPerformed,
} from "@capacitor/push-notifications";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function platform(): string {
  return Capacitor.getPlatform();
}

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  capturedAt: string;
}

function normalizePosition(position: Position | GeolocationPosition): CapturedLocation {
  return {
    latitude: Number(position.coords.latitude.toFixed(6)),
    longitude: Number(position.coords.longitude.toFixed(6)),
    accuracyMeters: Math.round(position.coords.accuracy),
    capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
  };
}

function captureBrowserLocation(): Promise<CapturedLocation | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(normalizePosition(position)),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 12000,
      }
    );
  });
}

export async function captureCurrentLocation(): Promise<CapturedLocation | null> {
  if (!isNative()) return captureBrowserLocation();

  try {
    let status = await Geolocation.checkPermissions();
    if (status.location !== "granted") {
      status = await Geolocation.requestPermissions({
        permissions: ["location"],
      });
    }

    if (status.location !== "granted") return null;

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 12000,
    });
    return normalizePosition(position);
  } catch (err) {
    console.warn("Location capture failed", err);
    return null;
  }
}

export async function captureProofPhoto(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      saveToGallery: false,
      correctOrientation: true,
    });
    return photo.dataUrl ?? null;
  } catch (err) {
    console.warn("Camera capture cancelled or failed", err);
    return null;
  }
}

export interface PushHooks {
  onToken?: (token: string) => void;
  onNotification?: (n: PushNotificationSchema) => void;
  onTap?: (a: ActionPerformed) => void;
}

function bookingIdFromNotification(action: ActionPerformed): string | null {
  const bookingId = action.notification.data?.bookingId;
  return typeof bookingId === "string" && bookingId.trim()
    ? bookingId.trim()
    : null;
}

function routeToBooking(bookingId: string) {
  if (typeof window === "undefined") return;
  window.location.href = `/booking/${bookingId}`;
}

export async function installPushNavigationHandlers(): Promise<void> {
  if (!isNative()) return;

  await PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action: ActionPerformed) => {
      const bookingId = bookingIdFromNotification(action);
      if (bookingId) routeToBooking(bookingId);
    }
  );
}

export async function registerPush(hooks: PushHooks = {}): Promise<boolean> {
  if (!isNative()) return false;

  const status: PermissionStatus = await PushNotifications.checkPermissions();
  let granted = status.receive === "granted";

  if (!granted) {
    const ask = await PushNotifications.requestPermissions();
    granted = ask.receive === "granted";
  }
  if (!granted) return false;

  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener("registration", (token: Token) => {
    hooks.onToken?.(token.value);
  });
  await PushNotifications.addListener(
    "registrationError",
    (err: { error: string }) => {
      console.warn("Push registration error", err.error);
    }
  );
  await PushNotifications.addListener(
    "pushNotificationReceived",
    (n: PushNotificationSchema) => {
      hooks.onNotification?.(n);
    }
  );
  await PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (a: ActionPerformed) => {
      hooks.onTap?.(a);
    }
  );

  await PushNotifications.register();
  return true;
}

export async function enableBookingPush(bookingId: string): Promise<boolean> {
  const trimmedBookingId = bookingId.trim();
  if (!trimmedBookingId) return false;

  return registerPush({
    onToken: (token) => {
      fetch("/api/push-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          platform: platform(),
          bookingId: trimmedBookingId,
        }),
      }).catch((err) => console.warn("token register failed", err));
    },
    onNotification: (notification) => {
      console.log(
        "Push received in foreground",
        notification.title,
        notification.body
      );
    },
    onTap: (action) => {
      const tappedBookingId = bookingIdFromNotification(action);
      routeToBooking(tappedBookingId ?? trimmedBookingId);
    },
  });
}
