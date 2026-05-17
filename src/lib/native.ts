"use client";

import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
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
