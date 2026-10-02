import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  MESSAGE_REACTIONS,
  type MessageReactionEmoji,
  type User,
  type Room,
  type Entry,
  type EntryKind,
  type Message,
  type MessagePage,
  type Snapshot,
  type Game,
} from "./types.ts";
import {
  correctGameAnswer,
  isGameKind,
  randomGameQuestion,
  type GameKind,
} from "./game-content.ts";

// LOCAL-ONLY alpha adapter. A persistent server disk is required. Do not deploy
// this adapter to Vercel/serverless. Production Supabase remains a separate stage.
export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function text(value: unknown, max = 2000, required = true): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new AppError("Проверьте заполнение полей.");
  return value.trim();
}
export function normalizedCode(value: unknown) {
  const code = text(value, 64).normalize("NFKC").toUpperCase();
  if (!/^[A-Z0-9-]{10,64}$/.test(code))
    throw new AppError("Код: 10–64 символа, латинские буквы, цифры и дефис.");
  return code;
}
function validDate(value: unknown) {
  const date = text(value, 10, false);
  if (
    date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date)
  )
    throw new AppError("Укажите корректную дату.");
  return date;
}
function validZone(value: unknown) {
  const zone = text(value, 80);
  try {
    new Intl.DateTimeFormat("ru", { timeZone: zone }).format();
  } catch {
    throw new AppError("Неизвестный часовой пояс.");
  }
  return zone;
}
async function passwordHash(
  password: string,
  salt = randomBytes(16).toString("hex"),
) {
  const key = await new Promise<Buffer>((done, fail) =>
    scrypt(password, salt, 64, (err, key) => (err ? fail(err) : done(key))),
  );
  return `${salt}:${key.toString("hex")}`;
}
async function passwordMatches(password: string, stored: string) {
  const [salt] = stored.split(":");
  const actual = await passwordHash(password, salt);
  return (
    actual.length === stored.length &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(stored))
  );
}
const kinds: EntryKind[] = [
  "event",
  "memory",
  "note",
  "wish",
  "movie",
  "music",
];
export class Store {
  db: DatabaseSync;
  key: Buffer;
  constructor(
    path = resolve(
      /*turbopackIgnore: true*/ process.env.LOVELOOM_DATA_DIR || ".data",
    ),
  ) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    const keyPath = join(path, "local.key");
    if (!existsSync(keyPath)) {
      try {
        writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: "wx" });
      } catch (error) {
        if (!existsSync(keyPath)) throw error;
      }
    }
    this.key = readFileSync(keyPath);
    this.db = new DatabaseSync(join(path, "loveloom.sqlite"));
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password TEXT NOT NULL,seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),fingerprint TEXT NOT NULL UNIQUE,code TEXT NOT NULL,start TEXT NOT NULL,timezone TEXT NOT NULL,created INTEGER NOT NULL,epoch INTEGER NOT NULL DEFAULT 1,billing TEXT NOT NULL DEFAULT 'free');
      CREATE TABLE IF NOT EXISTS members(user TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,nickname TEXT NOT NULL DEFAULT '');
      CREATE TRIGGER IF NOT EXISTS maximum_two BEFORE INSERT ON members WHEN (SELECT COUNT(*) FROM members WHERE room=NEW.room)>=2 BEGIN SELECT RAISE(ABORT,'ROOM_FULL'); END;
      CREATE TABLE IF NOT EXISTS messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,author TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,created INTEGER NOT NULL,reply_to TEXT REFERENCES messages(id) ON DELETE SET NULL);
      CREATE INDEX IF NOT EXISTS messages_room_seq ON messages(room,seq);
      CREATE TABLE IF NOT EXISTS message_reactions(message TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,emoji TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(message,user));
      CREATE INDEX IF NOT EXISTS message_reactions_message ON message_reactions(message,created);
      CREATE TABLE IF NOT EXISTS chat_reads(room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,last_read_seq INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL,PRIMARY KEY(room,user));
      CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,author TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,date TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1);
      CREATE INDEX IF NOT EXISTS entries_room ON entries(room,created);
      CREATE TABLE IF NOT EXISTS locations(user TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,lat REAL NOT NULL,lon REAL NOT NULL,updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,kind TEXT NOT NULL,question TEXT NOT NULL,choices TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS answers(game TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,user TEXT NOT NULL REFERENCES users(id),answer TEXT NOT NULL,PRIMARY KEY(game,user));
      CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS admin(id INTEGER PRIMARY KEY CHECK(id=1),password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS admin_sessions(token TEXT PRIMARY KEY,expires INTEGER NOT NULL);
    `);
    const messageColumns = this.db.prepare("PRAGMA table_info(messages)").all() as {
      name: string;
    }[];
    if (!messageColumns.some((column) => column.name === "reply_to"))
      this.db.exec(
        "ALTER TABLE messages ADD COLUMN reply_to TEXT REFERENCES messages(id) ON DELETE SET NULL",
      );
  }
  tx<T>(action: () => T) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
  limited(key: string, max = 15, period = 60000) {
    const now = Date.now();
    this.tx(() => {
      this.db.prepare("DELETE FROM limits WHERE until<?").run(now);
      const row = this.db
        .prepare("SELECT count FROM limits WHERE key=?")
        .get(key) as { count: number } | undefined;
      if (row && row.count >= max)
        throw new AppError(
          "Слишком много попыток. Попробуйте немного позже.",
          429,
        );
      this.db
        .prepare(
          "INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
        )
        .run(key, now + period);
    });
  }
  seal(code: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
  }
  unseal(code: string) {
    const bytes = Buffer.from(code, "base64"),
      decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        bytes.subarray(0, 12),
      );
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  }
  fingerprint(code: string) {
    return createHmac("sha256", this.key)
      .update(normalizedCode(code))
      .digest("hex");
  }
  async register(input: Record<string, unknown>) {
    const email = text(input.email, 254).toLowerCase(),
      name = text(input.name, 40),
      password = text(input.password, 128);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new AppError("Проверьте адрес почты.");
    if (password.length < 10)
      throw new AppError("В пароле должно быть не менее 10 символов.");
    if (input.ageConfirmed !== true)
      throw new AppError("Подтвердите, что вам исполнилось 14 лет.");
    const hash = await passwordHash(password);
    const id = randomUUID();
    try {
      this.db
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .run(id, email, name, hash, Date.now());
    } catch {
      throw new AppError(
        "Регистрация не удалась. Попробуйте войти или проверьте данные.",
      );
    }
    return this.newSession(id);
  }
  async login(input: Record<string, unknown>) {
    const email = text(input.email, 254).toLowerCase(),
      password = text(input.password, 128);
    const row = this.db
      .prepare("SELECT id,password FROM users WHERE email=?")
      .get(email) as { id: string; password: string } | undefined;
    const fake = "00000000000000000000000000000000:" + "0".repeat(128);
    const ok = await passwordMatches(password, row?.password || fake);
    if (!row || !ok) throw new AppError("Почта или пароль не совпадают.", 401);
    return this.newSession(row.id);
  }
  newSession(user: string) {
    const token = randomBytes(32).toString("base64url"),
      csrf = randomBytes(24).toString("base64url");
    this.db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run(digest(token), user, csrf, Date.now() + 7 * 86400000);
    return { token, csrf };
  }
  session(token: string | undefined) {
    if (!token) return null;
    const row = this.db
      .prepare(
        "SELECT users.id,users.name,users.email,sessions.csrf FROM sessions JOIN users ON users.id=sessions.user WHERE sessions.token=? AND expires>?",
      )
      .get(digest(token), Date.now()) as (User & { csrf: string }) | undefined;
    return row || null;
  }
  logout(token: string) {
    this.db.prepare("DELETE FROM sessions WHERE token=?").run(digest(token));
  }
  roomFor(user: string): Room | null {
    const r = this.db
      .prepare(
        "SELECT rooms.*,members.nickname FROM members JOIN rooms ON rooms.id=members.room WHERE members.user=?",
      )
      .get(user) as
      (Omit<Room, "members"> & { fingerprint: string }) | undefined;
    if (!r) return null;
    const members = this.db
      .prepare(
        "SELECT users.id,users.name,users.seen FROM members JOIN users ON users.id=members.user WHERE members.room=? ORDER BY CASE WHEN users.id=? THEN 0 ELSE 1 END",
      )
      .all(r.id, r.owner) as Room["members"];
    return {
      id: r.id,
      owner: r.owner,
      code: this.unseal(r.code),
      start: r.start,
      timezone: r.timezone,
      created: r.created,
      epoch: r.epoch,
      billing: "free",
      nickname: r.nickname,
      members,
    };
  }
  requireRoom(user: string, epoch?: unknown) {
    const room = this.roomFor(user);
    if (!room) throw new AppError("Вы больше не состоите в комнате.", 409);
    if (epoch !== undefined && epoch !== room.epoch)
      throw new AppError("История комнаты изменилась. Обновите страницу.", 409);
    return room;
  }
  snapshot(user: User & { csrf: string }): Snapshot {
    const room = this.roomFor(user.id);
    let distance: null | number = null,
      locationShared = false,
      locationUpdated: null | number = null;
    let entries: Entry[] = [];
    if (room) {
      entries = this.db
        .prepare("SELECT * FROM entries WHERE room=? ORDER BY created DESC")
        .all(room.id) as Entry[];
      const locations = this.db
        .prepare("SELECT user,lat,lon,updated FROM locations WHERE room=?")
        .all(room.id) as {
        user: string;
        lat: number;
        lon: number;
        updated: number;
      }[];
      locationShared = locations.some((l) => l.user === user.id);
      if (locations.length === 2) {
        const [a, b] = locations;
        const r = (n: number) => (n * Math.PI) / 180;
        const h =
          Math.sin(r(b.lat - a.lat) / 2) ** 2 +
          Math.cos(r(a.lat)) *
            Math.cos(r(b.lat)) *
            Math.sin(r(b.lon - a.lon) / 2) ** 2;
        distance = Math.round(6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h))));
        locationUpdated = Math.min(a.updated, b.updated);
      }
    }
    return {
      user: { id: user.id, name: user.name, email: user.email },
      room,
      entries,
      distance,
      locationShared,
      locationUpdated,
      csrf: user.csrf,
    };
  }
  heartbeat(user: string) {
    this.db.prepare("UPDATE users SET seen=? WHERE id=?").run(Date.now(), user);
  }
  createRoom(user: string, input: Record<string, unknown>) {
    const code = normalizedCode(input.code),
      start = validDate(input.start || ""),
      timezone = validZone(input.timezone || "Europe/Moscow");
    const fingerprint = this.fingerprint(code);
    return this.tx(() => {
      if (this.roomFor(user))
        throw new AppError("Аккаунт уже находится в комнате.", 409);
      if (
        this.db
          .prepare("SELECT id FROM rooms WHERE fingerprint=?")
          .get(fingerprint)
      )
        throw new AppError("Этот пароль уже занят.", 409);
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO rooms(id,owner,fingerprint,code,start,timezone,created) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          id,
          user,
          fingerprint,
          this.seal(code),
          start,
          timezone,
          Date.now(),
        );
      this.db
        .prepare("INSERT INTO members(user,room) VALUES(?,?)")
        .run(user, id);
      return id;
    });
  }
  joinRoom(user: string, input: Record<string, unknown>) {
    const fingerprint = this.fingerprint(text(input.code, 64));
    return this.tx(() => {
      if (this.roomFor(user))
        throw new AppError("Аккаунт уже находится в комнате.", 409);
      const row = this.db
        .prepare("SELECT id FROM rooms WHERE fingerprint=?")
        .get(fingerprint) as { id: string } | undefined;
      if (!row)
        throw new AppError("Не удалось войти. Проверьте пароль комнаты.", 404);
      const count = this.db
        .prepare("SELECT COUNT(*) AS n FROM members WHERE room=?")
        .get(row.id) as { n: number };
      if (count.n >= 2)
        throw new AppError("У нас все дома — в комнате уже двое.", 409);
      this.db
        .prepare("INSERT INTO members(user,room) VALUES(?,?)")
        .run(user, row.id);
      return row.id;
    });
  }
  leaveRoom(user: string, input: Record<string, unknown>) {
    return this.tx(() => {
      const room = this.requireRoom(user, input.epoch);
      if (room.owner === user)
        throw new AppError("Создатель может только удалить комнату.", 403);
      if (input.confirm !== "УДАЛИТЬ ИСТОРИЮ")
        throw new AppError("Подтвердите удаление истории.");
      for (const table of ["messages", "entries", "locations", "games"])
        this.db.prepare(`DELETE FROM ${table} WHERE room=?`).run(room.id);
      this.db.prepare("DELETE FROM chat_reads WHERE room=?").run(room.id);
      this.db.prepare("DELETE FROM members WHERE user=?").run(user);
      this.db
        .prepare("UPDATE members SET nickname='' WHERE room=?")
        .run(room.id);
      this.db
        .prepare("UPDATE rooms SET epoch=epoch+1,start='' WHERE id=?")
        .run(room.id);
    });
  }
  deleteRoom(user: string, input: Record<string, unknown>) {
    return this.tx(() => {
      const room = this.requireRoom(user, input.epoch);
      if (room.owner !== user)
        throw new AppError("Удалить комнату может только создатель.", 403);
      if (input.confirm !== "УДАЛИТЬ КОМНАТУ")
        throw new AppError("Подтвердите удаление комнаты.");
      this.db.prepare("DELETE FROM rooms WHERE id=?").run(room.id);
    });
  }
  updateRoom(user: string, input: Record<string, unknown>) {
    return this.tx(() => {
      const room = this.requireRoom(user, input.epoch);
      if ("nickname" in input)
        this.db
          .prepare("UPDATE members SET nickname=? WHERE user=?")
          .run(text(input.nickname, 40, false), user);
      if ("start" in input || "timezone" in input) {
        if (room.owner !== user)
          throw new AppError("Эти настройки меняет создатель комнаты.", 403);
        this.db
          .prepare("UPDATE rooms SET start=?,timezone=? WHERE id=?")
          .run(
            validDate(input.start ?? room.start),
            validZone(input.timezone ?? room.timezone),
            room.id,
          );
      }
    });
  }
  messages(user: string, before?: number): MessagePage {
    const room = this.requireRoom(user);
    const rows = this.db
      .prepare(
        `SELECT m.seq,m.id,m.author,m.text,m.created,m.reply_to,
          replied.author AS reply_author,replied.text AS reply_text
         FROM messages m
         LEFT JOIN messages replied ON replied.id=m.reply_to AND replied.room=m.room
         WHERE m.room=? AND m.seq<? ORDER BY m.seq DESC LIMIT 41`,
      )
      .all(room.id, before || Number.MAX_SAFE_INTEGER) as unknown as (Message & {
        reply_to: string | null;
        reply_author: string | null;
        reply_text: string | null;
      })[];
    const hasMore = rows.length > 40;
    const page = rows.slice(0, 40).reverse().map((message) => {
      const reactions = this.db
        .prepare(
          "SELECT emoji,user FROM message_reactions WHERE message=? ORDER BY created",
        )
        .all(message.id) as { emoji: MessageReactionEmoji; user: string }[];
      const grouped = new Map<MessageReactionEmoji, string[]>();
      for (const reaction of reactions)
        grouped.set(reaction.emoji, [
          ...(grouped.get(reaction.emoji) || []),
          reaction.user,
        ]);
      return {
        seq: message.seq,
        id: message.id,
        author: message.author,
        text: message.text,
        created: message.created,
        media: null,
        reply: message.reply_to
          ? {
              id: message.reply_to,
              author: message.reply_author || "",
              text: message.reply_text || "",
              mediaKind: null,
            }
          : null,
        reactions: [...grouped.entries()].map(([emoji, users]) => ({
          emoji,
          users,
        })),
      };
    });
    const partnerRead = this.db
      .prepare("SELECT MAX(last_read_seq) AS seq FROM chat_reads WHERE room=? AND user<>?")
      .get(room.id, user) as { seq: number | null } | undefined;
    return {
      messages: page,
      hasMore,
      epoch: room.epoch,
      partnerReadSeq: Number(partnerRead?.seq || 0),
    };
  }
  addMessage(user: string, input: Record<string, unknown>) {
    return this.tx(() => {
      const room = this.requireRoom(user, input.epoch),
        body = text(input.text, 4000),
        replyTo = input.replyTo ? text(input.replyTo, 64) : null;
      if (
        replyTo &&
        !this.db
          .prepare("SELECT 1 FROM messages WHERE id=? AND room=?")
          .get(replyTo, room.id)
      )
        throw new AppError("Сообщение для ответа больше недоступно.", 404);
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO messages(id,room,author,text,created,reply_to) VALUES(?,?,?,?,?,?)",
        )
        .run(id, room.id, user, body, Date.now(), replyTo);
      this.db
        .prepare(
          `DELETE FROM messages WHERE room=? AND seq IN (
            SELECT seq FROM messages WHERE room=? ORDER BY seq DESC LIMIT -1 OFFSET 1000
          )`,
        )
        .run(room.id, room.id);
      return id;
    });
  }
  reactMessage(user: string, input: Record<string, unknown>) {
    return this.tx(() => {
      const room = this.requireRoom(user, input.epoch),
        id = text(input.id, 64),
        emoji = text(input.emoji || "", 8, false) as MessageReactionEmoji;
      if (emoji && !(MESSAGE_REACTIONS as readonly string[]).includes(emoji))
        throw new AppError("Эта реакция пока не поддерживается.");
      if (
        !this.db
          .prepare("SELECT 1 FROM messages WHERE id=? AND room=?")
          .get(id, room.id)
      )
        throw new AppError("Сообщение больше недоступно.", 404);
      const current = this.db
        .prepare("SELECT emoji FROM message_reactions WHERE message=? AND user=?")
        .get(id, user) as { emoji: string } | undefined;
      if (!emoji || current?.emoji === emoji) {
        this.db
          .prepare("DELETE FROM message_reactions WHERE message=? AND user=?")
          .run(id, user);
        return;
      }
      this.db
        .prepare(
          `INSERT INTO message_reactions(message,user,emoji,created)
           VALUES(?,?,?,?) ON CONFLICT(message,user) DO UPDATE SET
           emoji=excluded.emoji,created=excluded.created`,
        )
        .run(id, user, emoji, Date.now());
    });
  }
  chatUnread(user: string, input: Record<string, unknown>) {
    const room = this.requireRoom(user, input.epoch);
    const read = this.db
      .prepare("SELECT last_read_seq FROM chat_reads WHERE room=? AND user=?")
      .get(room.id, user) as { last_read_seq: number } | undefined;
    const row = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN author<>? AND seq>? THEN 1 ELSE 0 END),0) AS unread,
           COALESCE(MAX(seq),0) AS latest
         FROM messages WHERE room=?`,
      )
      .get(user, read?.last_read_seq || 0, room.id) as {
      unread: number;
      latest: number;
    };
    return { unread: row.unread, latestSeq: row.latest, epoch: room.epoch };
  }
  markChatRead(user: string, input: Record<string, unknown>) {
    return this.tx(() => {
      const room = this.requireRoom(user, input.epoch),
        requested = Number(input.lastSeq);
      if (!Number.isSafeInteger(requested) || requested < 0)
        throw new AppError("Некорректная отметка прочтения.");
      const latest = this.db
        .prepare("SELECT COALESCE(MAX(seq),0) AS seq FROM messages WHERE room=?")
        .get(room.id) as { seq: number };
      const safe = Math.min(requested, latest.seq);
      this.db
        .prepare(
          `INSERT INTO chat_reads(room,user,last_read_seq,updated) VALUES(?,?,?,?)
           ON CONFLICT(room,user) DO UPDATE SET
           last_read_seq=MAX(chat_reads.last_read_seq,excluded.last_read_seq),
           updated=excluded.updated`,
        )
        .run(room.id, user, safe, Date.now());
      return { ok: true, lastReadSeq: safe, epoch: room.epoch };
    });
  }
  saveEntry(user: string, input: Record<string, unknown>) {
    return this.tx(() => {
      const room = this.requireRoom(user, input.epoch);
      const kind = text(input.kind, 20) as EntryKind;
      if (!kinds.includes(kind)) throw new AppError("Неизвестный раздел.");
      const title = text(input.title, 140),
        body = text(input.body || "", 4000, false),
        date = validDate(input.date || "");
      if (kind === "event" && !date)
        throw new AppError("Для события нужна дата.");
      if (input.id) {
        const old = this.db
          .prepare("SELECT * FROM entries WHERE id=? AND room=?")
          .get(text(input.id, 64), room.id) as Entry | undefined;
        if (!old) throw new AppError("Запись не найдена.", 404);
        if (input.version !== old.version)
          throw new AppError(
            "Партнёр уже изменил эту запись. Обновите её.",
            409,
          );
        this.db
          .prepare(
            "UPDATE entries SET title=?,body=?,date=?,done=?,version=version+1 WHERE id=? AND room=?",
          )
          .run(title, body, date, input.done ? 1 : 0, old.id, room.id);
      } else {
        const count = this.db
          .prepare("SELECT COUNT(*) AS n FROM entries WHERE room=?")
          .get(room.id) as { n: number };
        if (count.n >= 2000)
          throw new AppError("Достигнут лимит записей локальной версии.");
        this.db
          .prepare(
            "INSERT INTO entries(id,room,author,kind,title,body,date,created) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            room.id,
            user,
            kind,
            title,
            body,
            date,
            Date.now(),
          );
      }
    });
  }
  deleteEntry(user: string, input: Record<string, unknown>) {
    return this.tx(() => {
      const room = this.requireRoom(user, input.epoch);
      this.db
        .prepare("DELETE FROM entries WHERE id=? AND room=?")
        .run(text(input.id, 64), room.id);
    });
  }
  location(user: string, input: Record<string, unknown>) {
    return this.tx(() => {
      const room = this.requireRoom(user, input.epoch);
      if (input.clear === true) {
        this.db.prepare("DELETE FROM locations WHERE user=?").run(user);
        return;
      }
      if (
        input.consent !== true ||
        typeof input.lat !== "number" ||
        typeof input.lon !== "number" ||
        !Number.isFinite(input.lat) ||
        !Number.isFinite(input.lon) ||
        Math.abs(input.lat) > 90 ||
        Math.abs(input.lon) > 180
      )
        throw new AppError("Нет согласия или координаты некорректны."); // Round on server too; no precise coordinates retained.
      this.db
        .prepare(
          "INSERT INTO locations VALUES(?,?,?,?,?) ON CONFLICT(user) DO UPDATE SET lat=excluded.lat,lon=excluded.lon,updated=excluded.updated,room=excluded.room",
        )
        .run(
          user,
          room.id,
          Math.round(input.lat * 10) / 10,
          Math.round(input.lon * 10) / 10,
          Date.now(),
        );
    });
  }
  gameState(user: string): Game | null {
    const room = this.requireRoom(user);
    const g = this.db
      .prepare("SELECT * FROM games WHERE room=? ORDER BY created DESC LIMIT 1")
      .get(room.id) as
      | { id: string; kind: string; question: string; choices: string }
      | undefined;
    if (!g) return null;
    const rows = this.db
      .prepare("SELECT user,answer FROM answers WHERE game=?")
      .all(g.id) as { user: string; answer: string }[];
    const complete = rows.length === 2;
    return {
      id: g.id,
      kind: g.kind as GameKind,
      question: g.question,
      choices: JSON.parse(g.choices),
      complete,
      correctAnswer:
        complete && g.kind === "quiz" ? correctGameAnswer(g.question) : null,
      responses: rows.map((r) => {
        const visible = complete || r.user === user;
        const choice =
          g.kind === "know"
            ? (JSON.parse(r.answer) as { answer: string; guess: string })
            : { answer: r.answer, guess: null };
        return {
          user: r.user,
          answer: visible ? choice.answer : null,
          guess: visible ? choice.guess : null,
        };
      }),
    };
  }
  startGame(user: string, input: Record<string, unknown>) {
    return this.tx(() => {
      const room = this.requireRoom(user, input.epoch);
      if (room.members.length !== 2)
        throw new AppError(
          "Пригласите второго участника, чтобы играть вместе.",
        );
      const active = this.gameState(user);
      if (active && !active.complete)
        throw new AppError("Сначала завершите текущий раунд.", 409);
      const kind = text(input.kind, 20);
      if (!isGameKind(kind)) throw new AppError("Неизвестная игра.");
      const previous = this.db
        .prepare(
          "SELECT question FROM games WHERE room=? AND kind=? ORDER BY created DESC LIMIT 1",
        )
        .get(room.id, kind) as { question: string } | undefined;
      const question = randomGameQuestion(kind, previous?.question);
      this.db
        .prepare("INSERT INTO games VALUES(?,?,?,?,?,?)")
        .run(
          randomUUID(),
          room.id,
          kind,
          question.question,
          JSON.stringify(question.choices),
          Date.now(),
        );
    });
  }
  answerGame(user: string, input: Record<string, unknown>) {
    return this.tx(() => {
      this.requireRoom(user, input.epoch);
      const game = this.gameState(user),
        answer = text(input.answer, 200);
      if (!game || game.id !== input.id || !game.choices.includes(answer))
        throw new AppError("Этот раунд уже недоступен.");
      let storedAnswer = answer;
      if (game.kind === "know") {
        const guess = text(input.guess, 200);
        if (!game.choices.includes(guess))
          throw new AppError("Выберите предполагаемый ответ партнёра.");
        storedAnswer = JSON.stringify({ answer, guess });
      }
      try {
        this.db
          .prepare("INSERT INTO answers VALUES(?,?,?)")
          .run(game.id, user, storedAnswer);
      } catch {
        throw new AppError("Ответ уже принят. Ждём партнёра.", 409);
      }
    });
  }
  async setupAdmin(token: string, password: string) {
    const expected = process.env.LOVELOOM_ADMIN_SETUP_TOKEN;
    if (!expected || digest(token) !== digest(expected))
      throw new AppError("Ссылка настройки недействительна.", 403);
    if (password.length < 14 || password.length > 128)
      throw new AppError("Пароль администратора: от 14 до 128 символов.");
    const hash = await passwordHash(password);
    try {
      this.db.prepare("INSERT INTO admin VALUES(1,?)").run(hash);
    } catch {
      throw new AppError("Администратор уже настроен.", 409);
    }
  }
  async loginAdmin(password: string) {
    const row = this.db
      .prepare("SELECT password FROM admin WHERE id=1")
      .get() as { password: string } | undefined;
    if (!row || !(await passwordMatches(password, row.password)))
      throw new AppError("Вход администратора не выполнен.", 401);
    const token = randomBytes(32).toString("base64url");
    this.db
      .prepare("DELETE FROM admin_sessions WHERE expires<?")
      .run(Date.now());
    this.db
      .prepare("INSERT INTO admin_sessions VALUES(?,?)")
      .run(digest(token), Date.now() + 3600000);
    return token;
  }
  logoutAdmin(token: string | undefined) {
    if (token)
      this.db
        .prepare("DELETE FROM admin_sessions WHERE token=?")
        .run(digest(token));
  }
  adminOverview(token: string | undefined) {
    if (
      !token ||
      !this.db
        .prepare("SELECT token FROM admin_sessions WHERE token=? AND expires>?")
        .get(digest(token), Date.now())
    )
      throw new AppError("Войдите как администратор.", 401);
    return {
      users: this.db
        .prepare(
          "SELECT users.id,users.name,users.email,users.seen,members.room,rooms.owner FROM users LEFT JOIN members ON members.user=users.id LEFT JOIN rooms ON rooms.id=members.room ORDER BY rooms.created DESC,users.name",
        )
        .all(),
      rooms: this.db
        .prepare(
          "SELECT id,owner,created,billing FROM rooms ORDER BY created DESC",
        )
        .all(),
    };
  }
  close() {
    this.db.close();
  }
}
const globalStore = globalThis as unknown as { loveloomStore?: Store };
export function getStore() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.LOVELOOM_LOCAL_ALPHA !== "1"
  )
    throw new AppError(
      "Это локальная альфа. Облачное размещение ещё не настроено.",
      503,
    );
  return (globalStore.loveloomStore ??= new Store());
}
