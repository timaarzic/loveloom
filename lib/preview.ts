import {
  MESSAGE_REACTIONS,
  type Snapshot,
  type Message,
  type Game,
  type EntryKind,
  type MessageReactionEmoji,
} from "./types";
import {
  correctGameAnswer,
  isGameKind,
  randomGameQuestion,
} from "./game-content";

// Only used by the explicitly labelled GitHub Pages design preview.
// This is device-local sample state, never an authentication or server adapter.
const KEY = "loveloom-design-beta-v2";
type Preview = { snapshot: Snapshot; messages: Message[]; game: Game | null };
const people = [
  { id: "preview-alex", name: "Алекс", email: "alex@example.test" },
  { id: "preview-sasha", name: "Саша", email: "sasha@example.test" },
];
function seed(): Preview {
  const now = Date.now();
  const day = (offset: number) =>
    new Date(now + offset * 86400000).toISOString().slice(0, 10);
  const items: [EntryKind, string, string, string][] = [
    [
      "event",
      "Вечер без телефонов",
      "Готовим пасту, выбираем фильм и никуда не спешим.",
      day(5),
    ],
    [
      "memory",
      "Тот самый закат",
      "Долго гуляли и совершенно забыли про время. Хочется повторить!",
      day(-6),
    ],
    [
      "note",
      "Наш рецепт завтрака",
      "Блинчики, ягоды и ещё пять минут под одеялом.",
      "",
    ],
    [
      "note",
      "Куда поедем осенью?",
      "Небольшой город, уютная кофейня и много фотографий.",
      "",
    ],
    [
      "wish",
      "Встретить рассвет у моря",
      "Когда-нибудь, обязательно вместе.",
      "",
    ],
    ["movie", "Мой сосед Тоторо", "Для уютного вечера с какао.", ""],
    [
      "music",
      "Наш плейлист для прогулок",
      "Собрать песни, которые напоминают о лете.",
      "",
    ],
  ];
  return {
    snapshot: {
      user: people[0],
      csrf: "preview-only",
      distance: null,
      locationShared: false,
      locationUpdated: null,
      room: {
        id: "preview-room",
        owner: people[0].id,
        code: "LOOM-DESIGN-BETA",
        start: day(-44),
        timezone: "Europe/Moscow",
        created: now - 12 * 86400000,
        epoch: 1,
        billing: "free",
        nickname: "",
        members: people.map((p) => ({ id: p.id, name: p.name, seen: 0 })),
      },
      entries: items.map(([kind, title, body, date], i) => ({
        id: `preview-entry-${i}`,
        room: "preview-room",
        author: people[i % 2].id,
        kind,
        title,
        body,
        date,
        done: 0,
        created: now - i * 1000,
        version: 1,
      })),
    },
    messages: [
      {
        seq: 1,
        id: "preview-message-1",
        author: people[0].id,
        text: "Как насчёт прогулки на выходных?",
        created: now - 240000,
      },
      {
        seq: 2,
        id: "preview-message-2",
        author: people[1].id,
        text: "Давай! Выберем новое место 🌿",
        created: now - 180000,
      },
    ],
    game: null,
  };
}
function read(): Preview {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const value = JSON.parse(raw);
      if (value.snapshot && Array.isArray(value.messages)) return value;
    }
  } catch {
    /* Unavailable/corrupted local preview state is safe to reset. */
  }
  return seed();
}
function save(value: Preview) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    throw new Error("Браузер не разрешает сохранять изменения предпросмотра.");
  }
}
export function previewScreen(
  screen: "room" | "lobby" | "auth" | "switch" | "reset",
) {
  const state = screen === "reset" ? seed() : read();
  if (screen === "auth") state.snapshot.user = null;
  if (screen === "lobby") {
    state.snapshot.user = people[0];
    state.snapshot.room = null;
    state.snapshot.entries = [];
    state.messages = [];
    state.game = null;
  }
  if (screen === "room" && (!state.snapshot.user || !state.snapshot.room)) {
    save(seed());
    return;
  }
  if (screen === "switch") {
    state.snapshot.user =
      people[state.snapshot.user?.id === people[0].id ? 1 : 0];
  }
  save(state);
}
export async function previewApi(
  path: string,
  input?: unknown,
  method = "POST",
): Promise<any> {
  const state = read(),
    s = state.snapshot,
    data = (input || {}) as Record<string, any>;
  const route = path.split("?")[0];
  if (route === "state") return structuredClone(s);
  if (route === "presence") return { ok: true };
  if (route.startsWith("admin"))
    throw new Error(
      "В публичном предпросмотре нет доступа к админке. Здесь только вымышленные данные.",
    );
  if (route === "auth/logout") s.user = null;
  else if (route === "auth/login" || route === "auth/register") {
    // Form values and passwords are deliberately ignored and never stored.
    s.user = people[0];
    s.room = null;
    s.entries = [];
    state.messages = [];
    state.game = null;
  } else if (route === "room") {
    if (data.action === "create" || data.action === "join") {
      const fresh = seed();
      s.user = people[0];
      s.room = fresh.snapshot.room;
      s.room!.code = String(data.code || "LOOM-DESIGN-BETA").toUpperCase();
      s.room!.created = Date.now();
      s.room!.start = String(data.start || "");
      s.room!.timezone = String(data.timezone || "Europe/Moscow");
      if (data.action === "create")
        s.room!.members = s.room!.members.slice(0, 1);
      else s.user = people[1];
      s.entries = [];
      state.messages = [];
      state.game = null;
    } else if (data.action === "delete" || data.action === "leave") {
      s.room = null;
      s.entries = [];
      state.messages = [];
      state.game = null;
    } else if (s.room) {
      if (typeof data.start === "string") s.room.start = data.start;
      if (typeof data.timezone === "string") s.room.timezone = data.timezone;
      if (typeof data.nickname === "string") s.room.nickname = data.nickname;
    }
  } else if (route === "entries") {
    if (!s.room || !s.user) throw new Error("Откройте тестовую комнату.");
    if (method === "DELETE") {
      const id = data.id || new URLSearchParams(path.split("?")[1]).get("id");
      s.entries = s.entries.filter((e) => e.id !== id);
    } else {
      const existing = s.entries.find((e) => e.id === data.id);
      const entry = {
        id: existing?.id || crypto.randomUUID(),
        room: s.room.id,
        author: existing?.author || s.user.id,
        kind: data.kind as EntryKind,
        title: String(data.title || "").slice(0, 120),
        body: String(data.body || "").slice(0, 5000),
        date: String(data.date || ""),
        done: data.done ? 1 : 0,
        created: existing?.created || Date.now(),
        version: (existing?.version || 0) + 1,
      };
      if (!entry.title.trim()) throw new Error("Добавьте название.");
      s.entries = [entry, ...s.entries.filter((e) => e.id !== entry.id)];
    }
  } else if (route === "messages") {
    if (!s.room || !s.user) throw new Error("Откройте тестовую комнату.");
    if (input === undefined)
      return {
        messages: structuredClone(state.messages),
        hasMore: false,
        epoch: s.room.epoch,
        partnerReadSeq: 0,
      };
    const text = String(data.text || "")
      .trim()
      .slice(0, 4000);
    if (!text) throw new Error("Напишите сообщение.");
    state.messages.push({
      seq: (state.messages.at(-1)?.seq || 0) + 1,
      id: crypto.randomUUID(),
      author: s.user.id,
      text,
      created: Date.now(),
      reply: data.replyTo
        ? (() => {
            const replied = state.messages.find((message) => message.id === data.replyTo);
            return replied
              ? {
                  id: replied.id,
                  author: replied.author,
                  text: replied.text,
                  mediaKind: replied.media?.kind || null,
                }
              : null;
          })()
        : null,
      reactions: [],
    });
    state.messages = state.messages.slice(-1000);
  } else if (route === "messages/reaction") {
    if (!s.room || !s.user) throw new Error("Откройте тестовую комнату.");
    const message = state.messages.find((item) => item.id === data.id);
    const emoji = String(data.emoji || "") as MessageReactionEmoji;
    if (!message) throw new Error("Сообщение больше недоступно.");
    if (!(MESSAGE_REACTIONS as readonly string[]).includes(emoji))
      throw new Error("Эта реакция пока не поддерживается.");
    const reactions = (message.reactions || []).map((reaction) => ({
      ...reaction,
      users: reaction.users.filter((id) => id !== s.user!.id),
    }));
    const selected = reactions.find((reaction) => reaction.emoji === emoji);
    const alreadySelected = (message.reactions || []).some(
      (reaction) => reaction.emoji === emoji && reaction.users.includes(s.user!.id),
    );
    if (!alreadySelected) {
      if (selected) selected.users.push(s.user.id);
      else reactions.push({ emoji, users: [s.user.id] });
    }
    message.reactions = reactions.filter((reaction) => reaction.users.length);
  } else if (route === "messages/unread") {
    return { unread: 0, latestSeq: state.messages.at(-1)?.seq || 0, epoch: s.room?.epoch || 0 };
  } else if (route === "messages/read") {
    return { ok: true, lastReadSeq: Number(data.lastSeq || 0), epoch: s.room?.epoch || 0 };
  } else if (route === "games") {
    if (input === undefined) {
      const game = structuredClone(state.game);
      if (game && !game.complete)
        game.responses = game.responses.map((r) =>
          r.user === s.user?.id ? r : { ...r, answer: null, guess: null },
        );
      return { game };
    }
    if (data.action !== "answer" && data.kind) {
      if (state.game && !state.game.complete)
        throw new Error(
          "Ответьте за обоих участников, переключив роль сверху.",
        );
      const kind = String(data.kind);
      if (!isGameKind(kind)) throw new Error("Выберите игру.");
      const question = randomGameQuestion(kind, state.game?.question);
      state.game = {
        id: crypto.randomUUID(),
        kind,
        question: question.question,
        choices: [...question.choices],
        responses: [],
        complete: false,
        correctAnswer: null,
      };
    } else {
      const g = state.game;
      if (!g || !s.user || g.id !== data.id || !g.choices.includes(data.answer))
        throw new Error("Выберите ответ.");
      if (g.responses.some((r) => r.user === s.user!.id))
        throw new Error(
          "Ответ уже принят. Переключите роль в панели предпросмотра.",
        );
      if (g.kind === "know" && !g.choices.includes(data.guess))
        throw new Error("Выберите предполагаемый ответ партнёра.");
      g.responses.push({
        user: s.user.id,
        answer: data.answer,
        guess: g.kind === "know" ? data.guess : null,
      });
      g.complete = g.responses.length === 2;
      if (g.complete && g.kind === "quiz")
        g.correctAnswer = correctGameAnswer(g.question);
    }
  } else if (route === "location")
    throw new Error(
      "В дизайн-бете геолокация не собирается. Здесь можно оценить только виджет.",
    );
  else throw new Error("Эта возможность требует подключения сервера.");
  save(state);
  return { ok: true };
}
