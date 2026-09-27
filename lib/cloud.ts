import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Snapshot } from "./types";

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

export function onCloudAuthChange(refresh: () => void) {
  const { data } = cloud().auth.onAuthStateChange(() => {
    // Supabase recommends deferring follow-up client calls from this callback.
    window.setTimeout(refresh, 0);
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
    const redirectTo = window.location.href.split(/[?#]/)[0];
    const { data: result, error } = await cloud().auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: redirectTo },
    });
    if (error) friendly(error);
    return { ok: true, needsConfirmation: !result.session };
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
    const { error } = await cloud().auth.signOut({ scope: "local" });
    if (error) friendly(error);
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
      return { ok: true };
    }
    if (action === "delete") {
      await rpc("loveloom_delete_room", {
        p_epoch: Number(data.epoch),
        p_confirm: String(data.confirm || ""),
      });
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
      return rpc("loveloom_get_messages", {
        p_before: raw ? Number(raw) : null,
      });
    }
    await rpc("loveloom_add_message", {
      p_epoch: Number(data.epoch),
      p_text: String(data.text || ""),
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
