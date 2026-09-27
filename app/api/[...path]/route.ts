import { cookies } from "next/headers";
import { AppError, getStore, text } from "@/lib/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const sessionName = "loveloom_session";
type Context = { params: Promise<{ path: string[] }> };
const reply = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
async function handle(req: Request, ctx: Context) {
  try {
    const path = (await ctx.params).path.join("/");
    const store = getStore(),
      jar = await cookies(),
      token = jar.get(sessionName)?.value,
      session = store.session(token);
    const mutating = req.method !== "GET";
    if (mutating) {
      const origin = req.headers.get("origin");
      const site = req.headers.get("sec-fetch-site");
      // Next may normalize req.url to localhost. Validate against the actual
      // loopback Host instead; never accept a forwarded host or arbitrary origin.
      const host = req.headers.get("host") || "";
      const loopback = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host);
      const expectedOrigin = new URL(req.url).protocol + "//" + host;
      if (
        !loopback ||
        site === "cross-site" ||
        (origin && origin !== expectedOrigin)
      )
        throw new AppError("Запрос с другого сайта отклонён.", 403);
      if (!req.headers.get("content-type")?.startsWith("application/json"))
        throw new AppError("Требуется JSON.", 415);
    }
    let body: Record<string, unknown> = {};
    if (mutating) {
      const raw = await req.text();
      if (raw.length > 20000)
        throw new AppError("Запрос слишком большой.", 413);
      try {
        body = JSON.parse(raw);
      } catch {
        throw new AppError("Некорректный запрос.");
      }
      if (!body || Array.isArray(body) || typeof body !== "object")
        throw new AppError("Некорректный запрос.");
    }
    const setSession = (value: string, name = sessionName) =>
      jar.set(name, value, {
        httpOnly: true,
        sameSite: "strict",
        secure: new URL(req.url).protocol === "https:",
        path: "/",
        maxAge: name === sessionName ? 7 * 86400 : 3600,
      });
    // This local server binds only to loopback. Do not trust forwarded IP headers.
    if (path.startsWith("auth/") && mutating)
      store.limited("auth:local", 30, 60000);
    if (path === "auth/register" && req.method === "POST") {
      const result = await store.register(body);
      setSession(result.token);
      return reply({ ok: true }, 201);
    }
    if (path === "auth/login" && req.method === "POST") {
      const result = await store.login(body);
      setSession(result.token);
      return reply({ ok: true });
    }
    if (path === "state" && req.method === "GET")
      return reply(
        session
          ? store.snapshot(session)
          : {
              user: null,
              room: null,
              entries: [],
              distance: null,
              locationShared: false,
              locationUpdated: null,
              csrf: "",
            },
      );
    if (path.startsWith("admin")) {
      if (mutating) store.limited("admin:local", 6, 60000);
      if (path === "admin/setup" && req.method === "POST") {
        await store.setupAdmin(text(body.token, 128), text(body.password, 128));
        return reply({ ok: true });
      }
      if (path === "admin/login" && req.method === "POST") {
        const t = await store.loginAdmin(text(body.password, 128));
        setSession(t, "loveloom_admin");
        return reply({ ok: true });
      }
      if (path === "admin" && req.method === "GET")
        return reply(store.adminOverview(jar.get("loveloom_admin")?.value));
      if (path === "admin/logout" && req.method === "POST") {
        store.logoutAdmin(jar.get("loveloom_admin")?.value);
        jar.delete("loveloom_admin");
        return reply({ ok: true });
      }
      throw new AppError("Не найдено.", 404);
    }
    if (!session) throw new AppError("Войдите в аккаунт.", 401);
    if (mutating && req.headers.get("x-csrf-token") !== session.csrf)
      throw new AppError("Обновите страницу и повторите действие.", 403);
    if (mutating) store.limited(`user:${session.id}`, 90, 60000);
    if (
      mutating &&
      ["messages", "entries", "location", "games", "room"].includes(path) &&
      !(path === "room" && ["create", "join"].includes(String(body.action)))
    ) {
      const current = store.requireRoom(session.id, body.epoch);
      if (body.roomId !== current.id || body.epoch !== current.epoch)
        throw new AppError("Комната изменилась. Обновите страницу.", 409);
    }
    if (path === "auth/logout" && req.method === "POST") {
      store.logout(token!);
      jar.delete(sessionName);
      return reply({ ok: true });
    }
    if (path === "presence" && req.method === "POST") {
      store.heartbeat(session.id);
      return reply({ ok: true });
    }
    if (path === "room" && req.method === "POST") {
      store.limited(`rooms:${session.id}`, 12, 60000);
      switch (body.action) {
        case "create":
          store.createRoom(session.id, body);
          break;
        case "join":
          store.joinRoom(session.id, body);
          break;
        case "leave":
          store.leaveRoom(session.id, body);
          break;
        case "delete":
          store.deleteRoom(session.id, body);
          break;
        case "update":
          store.updateRoom(session.id, body);
          break;
        default:
          throw new AppError("Неизвестное действие.");
      }
      return reply({ ok: true });
    }
    if (path === "messages" && req.method === "GET") {
      const raw = new URL(req.url).searchParams.get("before");
      const before = raw ? Number(raw) : undefined;
      if (before !== undefined && (!Number.isSafeInteger(before) || before < 1))
        throw new AppError("Некорректная страница.");
      return reply(store.messages(session.id, before));
    }
    if (path === "messages" && req.method === "POST") {
      store.addMessage(session.id, body);
      return reply({ ok: true }, 201);
    }
    if (path === "entries" && req.method === "POST") {
      store.saveEntry(session.id, body);
      return reply({ ok: true });
    }
    if (path === "entries" && req.method === "DELETE") {
      store.deleteEntry(session.id, body);
      return reply({ ok: true });
    }
    if (path === "location" && req.method === "POST") {
      store.location(session.id, body);
      return reply({ ok: true });
    }
    if (path === "games" && req.method === "GET")
      return reply({ game: store.gameState(session.id) });
    if (path === "games" && req.method === "POST") {
      if (body.action === "answer") store.answerGame(session.id, body);
      else store.startGame(session.id, body);
      return reply({ ok: true });
    }
    throw new AppError("Маршрут не найден.", 404);
  } catch (err) {
    if (err instanceof AppError)
      return reply({ error: err.message }, err.status);
    console.error(
      "LoveLoom server error",
      err instanceof Error ? err.name : "unknown",
    );
    return reply(
      { error: "Не удалось выполнить действие. Повторите позже." },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
