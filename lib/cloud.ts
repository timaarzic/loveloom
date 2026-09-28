import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  GardenState,
  MediaContext,
  MediaItem,
  MediaKind,
  Message,
  Snapshot,
  TimeCapsule,
} from "./types";
import { mediaExtensions, resolveMediaMime } from "./media";
import {
  cloudPushState,
  disableCloudPush,
  enableCloudPush,
  notifyPartnerAboutMessage,
  type PushState,
} from "./push";

// Publishable keys are intentionally safe to ship in a browser bundle. All
// authorization is enforced by Postgres functions and RLS, never by this key.
const projectUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://zolvjfgbkvzyrarwpeel.supabase.co";
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_QGMC3Zr66Y0XYhsAAczjmg_9HhPJOZW";

let instance: SupabaseClient | null = null;

function cloud() {
  if (!instance) {
    instance = createClient(projectUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "loveloom-cloud-auth-v1",
      },
    });
  }
  return instance;
}

const signedOut: Snapshot = {
  user: null,
  room: null,
  entries: [],
  distance: null,
  locationShared: false,
  locationUpdated: null,
  csrf: "",
};

type Input = Record<string, unknown>;
type CloudError = { message?: string; code?: string; status?: number } | null;

function friendly(error: CloudError): never {
  const raw = error?.message || "Не удалось выполнить действие.";
  const value = raw.toLowerCase();
  if (value.includes("invalid login credentials"))
    throw new Error("Неверная почта или пароль.");
  if (value.includes("email not confirmed"))
    throw new Error("Сначала подтвердите почту по письму от LoveLoom.");
  if (value.includes("user already registered"))
    throw new Error("Аккаунт с такой почтой уже существует.");
  if (value.includes("password should be"))
    throw new Error("Пароль должен содержать не менее 10 символов.");
  if (value.includes("rate limit") || error?.status === 429)
    throw new Error("Слишком много попыток. Немного подождите и повторите.");
  if (value.includes("failed to fetch") || value.includes("network"))
    throw new Error("Не удалось связаться с облаком. Проверьте интернет.");
  if (value.includes("mime") || value.includes("content type"))
    throw new Error("Формат этого файла не поддерживается. Выберите другое фото.");
  if (value.includes("payload too large") || error?.status === 413)
    throw new Error("Файл слишком большой для облачной загрузки.");
  if (value.includes("row-level security") || value.includes("violates security"))
    throw new Error("Не удалось подтвердить доступ к комнате. Перезайдите и повторите.");
  throw new Error(raw);
}

async function rpc(name: string, params: Input = {}) {
  const { data, error } = await cloud().rpc(name, params);
  if (error) friendly(error);
  return data;
}

function has(input: Input, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

const mediaBucket = "loveloom-media";
const signedMediaCache = new Map<
  string,
  { url: string; expiresAt: number }
>();

function mediaKind(mime: string): MediaKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

async function signMedia<T extends MediaItem>(items: T[]): Promise<T[]> {
  if (!items.length) return items;
  const paths = [...new Set(items.map((item) => item.path))];
  const now = Date.now();
  const missing = paths.filter(
    (path) => (signedMediaCache.get(path)?.expiresAt || 0) < now + 60_000,
  );
  if (missing.length) {
    const { data, error } = await cloud()
      .storage.from(mediaBucket)
      .createSignedUrls(missing, 10 * 60);
    if (error) friendly(error);
    for (const item of data || []) {
      if (item.path && item.signedUrl)
        signedMediaCache.set(item.path, {
          url: item.signedUrl,
          expiresAt: now + 10 * 60_000,
        });
    }
  }
  return items.map((item) => ({
    ...item,
    url: signedMediaCache.get(item.path)?.url,
  }));
}

async function signMessages(messages: Message[]) {
  const withMedia = messages.filter((message) => message.media?.path);
  if (!withMedia.length) return messages;
  const signed = await signMedia(
    withMedia.map((message) => message.media!) as MediaItem[],
  );
  const byId = new Map(signed.map((item) => [item.id, item]));
  return messages.map((message) => ({
    ...message,
    media: message.media ? byId.get(message.media.id) || message.media : null,
  }));
}

function appUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function onCloudAuthChange(refresh: (event: string) => void) {
  const { data } = cloud().auth.onAuthStateChange((event) => {
    // Supabase recommends deferring follow-up client calls from this callback.
    window.setTimeout(() => refresh(event), 0);
  });
  return () => data.subscription.unsubscribe();
}

export async function cloudApi(
  path: string,
  input?: unknown,
  method = "POST",
): Promise<any> {
  const data = (input || {}) as Input;
  const route = path.split("?")[0];

  if (route === "state") {
    const {
      data: { session },
      error,
    } = await cloud().auth.getSession();
    if (error) friendly(error);
    if (!session) return structuredClone(signedOut);
    const state = await rpc("loveloom_state");
    return state as Snapshot;
  }

  if (route === "auth/register") {
    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");
    if (data.ageConfirmed !== true)
      throw new Error("Подтвердите, что вам исполнилось 14 лет.");
    if (!name || name.length > 40) throw new Error("Укажите ваше имя.");
    if (password.length < 10)
      throw new Error("Пароль должен содержать не менее 10 символов.");
    const redirectTo = appUrl();
    const { data: result, error } = await cloud().auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: redirectTo },
    });
    if (error) friendly(error);
    return { ok: true, needsConfirmation: !result.session };
  }

  if (route === "auth/resend") {
    const email = String(data.email || "").trim().toLowerCase();
    if (!email) throw new Error("Укажите электронную почту.");
    const { error } = await cloud().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: appUrl() },
    });
    if (error) friendly(error);
    return { ok: true };
  }

  if (route === "auth/recovery") {
    const email = String(data.email || "").trim().toLowerCase();
    if (!email) throw new Error("Укажите электронную почту.");
    const redirect = new URL(appUrl());
    redirect.searchParams.set("recovery", "1");
    const { error } = await cloud().auth.resetPasswordForEmail(email, {
      redirectTo: redirect.toString(),
    });
    if (error) friendly(error);
    return { ok: true };
  }

  if (route === "auth/update-password") {
    const password = String(data.password || "");
    if (password.length < 10)
      throw new Error("Пароль должен содержать не менее 10 символов.");
    const { error } = await cloud().auth.updateUser({ password });
    if (error) friendly(error);
    return { ok: true };
  }

  if (route === "auth/login") {
    const { error } = await cloud().auth.signInWithPassword({
      email: String(data.email || "").trim().toLowerCase(),
      password: String(data.password || ""),
    });
    if (error) friendly(error);
    return { ok: true };
  }

  if (route === "auth/logout") {
    await disableCloudPush(cloud()).catch(() => {});
    const { error } = await cloud().auth.signOut({ scope: "local" });
    if (error) friendly(error);
    signedMediaCache.clear();
    return { ok: true };
  }

  if (route === "presence") {
    await rpc("loveloom_presence");
    return { ok: true };
  }

  if (route === "room") {
    const action = String(data.action || "");
    if (action === "create") {
      const roomId = await rpc("loveloom_create_room", {
        p_code: String(data.code || ""),
        p_start: String(data.start || ""),
        p_timezone: String(data.timezone || "Europe/Moscow"),
      });
      return { ok: true, roomId };
    }
    if (action === "join") {
      const result = (await rpc("loveloom_join_room", {
        p_code: String(data.code || ""),
      })) as { ok: boolean; error?: string; roomId?: string };
      if (!result.ok) throw new Error(result.error || "Не удалось войти в комнату.");
      return result;
    }
    if (action === "leave") {
      await rpc("loveloom_leave_room", {
        p_epoch: Number(data.epoch),
        p_confirm: String(data.confirm || ""),
      });
      signedMediaCache.clear();
      return { ok: true };
    }
    if (action === "delete") {
      await rpc("loveloom_delete_room", {
        p_epoch: Number(data.epoch),
        p_confirm: String(data.confirm || ""),
      });
      signedMediaCache.clear();
      return { ok: true };
    }
    if (action === "update") {
      if (has(data, "start") || has(data, "timezone"))
        await rpc("loveloom_update_room_settings", {
          p_epoch: Number(data.epoch),
          p_start: String(data.start || ""),
          p_timezone: String(data.timezone || "Europe/Moscow"),
        });
      if (has(data, "nickname"))
        await rpc("loveloom_update_nickname", {
          p_epoch: Number(data.epoch),
          p_nickname: String(data.nickname || ""),
        });
      return { ok: true };
    }
    throw new Error("Неизвестное действие с комнатой.");
  }

  if (route === "messages") {
    if (input === undefined) {
      const query = new URLSearchParams(path.split("?")[1] || "");
      const raw = query.get("before");
      const result = (await rpc("loveloom_get_messages", {
        p_before: raw ? Number(raw) : null,
      })) as { messages: Message[]; hasMore: boolean; epoch: number };
      result.messages = await signMessages(result.messages);
      return result;
    }
    const messageId = String(await rpc("loveloom_add_message", {
      p_epoch: Number(data.epoch),
      p_text: String(data.text || ""),
    }));
    await notifyPartnerAboutMessage(cloud(), messageId).catch(() => {});
    return { ok: true, messageId };
  }

  if (route === "messages/unread") {
    return rpc("loveloom_chat_unread", {
      p_epoch: Number(data.epoch),
    });
  }

  if (route === "messages/read") {
    return rpc("loveloom_mark_chat_read", {
      p_epoch: Number(data.epoch),
      p_last_seq: Number(data.lastSeq),
    });
  }

  if (route === "media") {
    if (input === undefined) {
      const query = new URLSearchParams(path.split("?")[1] || "");
      const context = String(query.get("context") || "album") as MediaContext;
      const items = (await rpc("loveloom_list_media", {
        p_context: context,
      })) as MediaItem[];
      return { items: await signMedia(items) };
    }

    const file = data.file;
    if (!(file instanceof File)) throw new Error("Выберите файл.");
    const mime = resolveMediaMime(file.type, file.name);
    const kind = mediaKind(mime);
    const extension = mediaExtensions[mime];
    const context = String(data.context || "chat") as MediaContext;
    const roomId = String(data.roomId || "");
    if (!kind || !extension)
      throw new Error("Этот формат файла пока не поддерживается.");
    if (context === "album" && kind !== "image")
      throw new Error("В фотоальбом можно добавлять только изображения.");
    if (!roomId) throw new Error("Комната не найдена.");
    if (file.size < 1 || file.size > 100 * 1024 * 1024)
      throw new Error("Размер файла должен быть не больше 100 МБ.");
    if (kind === "audio" && file.size > 25 * 1024 * 1024)
      throw new Error("Голосовое сообщение должно быть не больше 25 МБ.");

    const id = crypto.randomUUID();
    const storagePath = `${roomId}/${id}.${extension}`;
    const bucket = cloud().storage.from(mediaBucket);
    const { error: uploadError } = await bucket.upload(storagePath, file, {
      cacheControl: "3600",
      contentType: mime,
      upsert: false,
    });
    if (uploadError) friendly(uploadError);
    try {
      const registeredId = String(await rpc("loveloom_register_media", {
        p_id: id,
        p_epoch: Number(data.epoch),
        p_path: storagePath,
        p_kind: kind,
        p_context: context,
        p_mime: mime,
        p_bytes: file.size,
        p_caption: String(data.caption || ""),
      }));
      if (context === "chat")
        await notifyPartnerAboutMessage(cloud(), registeredId).catch(() => {});
    } catch (error) {
      await bucket.remove([storagePath]).catch(() => {});
      throw error;
    }
    const [item] = await signMedia([
      {
        id,
        room: roomId,
        author: String(data.authorId || ""),
        kind,
        context,
        mime,
        bytes: file.size,
        caption: String(data.caption || "").trim(),
        path: storagePath,
        created: Date.now(),
      },
    ]);
    return { ok: true, item };
  }

  if (route === "push") {
    const action = String(data.action || "status");
    if (action === "status")
      return { state: (await cloudPushState(cloud())) as PushState };
    if (action === "enable") {
      await enableCloudPush(cloud());
      return { state: "enabled" as PushState };
    }
    if (action === "disable") {
      await disableCloudPush(cloud());
      return { state: "disabled" as PushState };
    }
    throw new Error("Неизвестная настройка уведомлений.");
  }

  if (route === "capsules") {
    if (input === undefined)
      return {
        capsules: (await rpc("loveloom_list_capsules")) as TimeCapsule[],
      };
    await rpc("loveloom_create_capsule", {
      p_epoch: Number(data.epoch),
      p_title: String(data.title || ""),
      p_body: String(data.body || ""),
      p_opens_at: String(data.opensAt || ""),
    });
    return { ok: true };
  }

  if (route === "garden") {
    if (input === undefined)
      return { garden: (await rpc("loveloom_garden_state")) as GardenState };
    await rpc("loveloom_water_garden", {
      p_epoch: Number(data.epoch),
    });
    return { ok: true };
  }

  if (route === "entries") {
    if (method === "DELETE") {
      await rpc("loveloom_delete_entry", {
        p_id: String(data.id || ""),
        p_epoch: Number(data.epoch),
      });
      return { ok: true };
    }
    await rpc("loveloom_save_entry", {
      p_id: data.id ? String(data.id) : null,
      p_version: data.version == null ? null : Number(data.version),
      p_kind: String(data.kind || ""),
      p_title: String(data.title || ""),
      p_body: String(data.body || ""),
      p_date: String(data.date || ""),
      p_done: Boolean(data.done),
      p_epoch: Number(data.epoch),
    });
    return { ok: true };
  }

  if (route === "location") {
    await rpc("loveloom_update_location", {
      p_epoch: Number(data.epoch),
      p_clear: Boolean(data.clear),
      p_consent: Boolean(data.consent),
      p_latitude: typeof data.lat === "number" ? data.lat : null,
      p_longitude: typeof data.lon === "number" ? data.lon : null,
    });
    return { ok: true };
  }

  if (route === "games") {
    if (input === undefined)
      return { game: await rpc("loveloom_get_game") };
    if (data.action === "answer") {
      await rpc("loveloom_answer_game", {
        p_epoch: Number(data.epoch),
        p_id: String(data.id || ""),
        p_answer: String(data.answer || ""),
        p_guess: data.guess == null ? null : String(data.guess),
      });
    } else {
      await rpc("loveloom_start_game", {
        p_epoch: Number(data.epoch),
        p_kind: String(data.kind || ""),
      });
    }
    return { ok: true };
  }

  if (route.startsWith("admin"))
    throw new Error("Админ-панель будет подключена отдельным защищённым этапом.");
  throw new Error("Функция пока не подключена к облачной beta-версии.");
}

export type TouchConnection = {
  sendHeart: () => Promise<boolean>;
  close: () => void;
};

export function openCloudTouch(
  roomId: string,
  userId: string,
  handlers: {
    onHeart: () => void;
    onPresence: (count: number) => void;
    onStatus: (status: "connecting" | "ready" | "error") => void;
  },
): TouchConnection {
  const channel = cloud().channel(`loveloom:touch:${roomId}`, {
    config: {
      private: true,
      broadcast: { self: false, ack: true },
      presence: { key: userId, enabled: true },
    },
  });
  let ready = false;
  const syncPresence = () =>
    handlers.onPresence(Object.keys(channel.presenceState()).length);

  handlers.onStatus("connecting");
  channel
    .on("broadcast", { event: "heart" }, ({ payload }) => {
      if (payload?.sender !== userId) handlers.onHeart();
    })
    .on("presence", { event: "sync" }, syncPresence)
    .on("presence", { event: "join" }, syncPresence)
    .on("presence", { event: "leave" }, syncPresence)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        ready = true;
        handlers.onStatus("ready");
        await channel.track({ user: userId, joinedAt: Date.now() });
        syncPresence();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        ready = false;
        handlers.onStatus("error");
      }
    });

  return {
    async sendHeart() {
      if (!ready) return false;
      const result = await channel.send({
        type: "broadcast",
        event: "heart",
        payload: { sender: userId, sentAt: Date.now() },
      });
      return result === "ok";
    },
    close() {
      ready = false;
      void channel.untrack();
      void cloud().removeChannel(channel);
    },
  };
}
