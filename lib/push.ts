import type { SupabaseClient } from "@supabase/supabase-js";
import { asset } from "./assets";

export type PushState =
  | "checking"
  | "install-required"
  | "unsupported"
  | "denied"
  | "disabled"
  | "enabled";

function needsIosInstallation() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    navigatorWithStandalone.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  return ios && !standalone;
}

function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToBytes(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function registerLoveLoomWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register(asset("/sw.js"), {
    scope: asset("/"),
  });
}

async function worker() {
  const registration = await registerLoveLoomWorker();
  if (!registration) throw new Error("Service Worker недоступен.");
  await navigator.serviceWorker.ready;
  return registration;
}

async function saveSubscription(client: SupabaseClient, subscription: PushSubscription) {
  const serialized = subscription.toJSON();
  const { error } = await client.rpc("loveloom_upsert_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: serialized.keys?.p256dh || "",
    p_auth: serialized.keys?.auth || "",
    p_expiration_time: subscription.expirationTime,
    p_device_label: "Устройство LoveLoom",
  });
  if (error) throw error;
}

export async function cloudPushState(client: SupabaseClient): Promise<PushState> {
  if (needsIosInstallation()) return "install-required";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await worker();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return "disabled";
  await saveSubscription(client, subscription);
  return "enabled";
}

export async function enableCloudPush(client: SupabaseClient) {
  if (needsIosInstallation())
    throw new Error(
      "На iPhone сначала добавьте LoveLoom на экран «Домой» и откройте оттуда.",
    );
  if (!pushSupported())
    throw new Error("Этот браузер не поддерживает Push-уведомления.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      permission === "denied"
        ? "Уведомления запрещены в настройках браузера."
        : "Разрешение на уведомления не выдано.",
    );

  const registration = await worker();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { data, error } = await client.functions.invoke("loveloom-push", {
      body: { action: "key" },
    });
    if (error || !data?.publicKey)
      throw new Error("Не удалось подготовить защищённую Push-подписку.");
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(String(data.publicKey)),
    });
  }
  await saveSubscription(client, subscription);
}

export async function disableCloudPush(client: SupabaseClient) {
  if (!pushSupported()) return;
  const registration = await worker();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const { error } = await client.rpc("loveloom_remove_push_subscription", {
    p_endpoint: subscription.endpoint,
  });
  await subscription.unsubscribe();
  if (error) throw error;
}

export async function notifyPartnerAboutMessage(
  client: SupabaseClient,
  messageId: string,
) {
  const { error } = await client.functions.invoke("loveloom-push", {
    body: { action: "send-message", messageId },
  });
  if (error) throw error;
}
