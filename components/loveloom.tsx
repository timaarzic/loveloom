"use client";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import {
  Heart,
  Home,
  MessageCircle,
  CalendarDays,
  Gamepad2,
  Settings,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  LogOut,
  Copy,
  Check,
  LockKeyhole,
  Eye,
  EyeOff,
  X,
  Send,
  Video,
  MapPin,
  NotebookPen,
  Gift,
  Film,
  Music2,
  Camera,
  Sparkles,
  ShieldCheck,
  Trash2,
  RefreshCw,
  Users,
  Clock,
  WifiOff,
  Pencil,
  CheckCircle2,
  BookHeart,
  LoaderCircle,
  Mail,
  Download,
  Info,
  Mic,
  Paperclip,
  Palette,
  Square,
} from "lucide-react";
import type { Snapshot, Entry, EntryKind, Message, Game } from "@/lib/types";
import { asset } from "@/lib/assets";
import { previewApi, previewScreen } from "@/lib/preview";
import { cloudApi, onCloudAuthChange } from "@/lib/cloud";
import MomentsHub, { MediaBubble } from "@/components/moments";
type Tab = "home" | "chat" | "together" | "games" | "settings";
type Modal =
  | "create"
  | "join"
  | "code"
  | "entry"
  | "leave"
  | "delete"
  | "location"
  | "admin"
  | "about"
  | "widgets"
  | "story"
  | "call"
  | "progress"
  | "email"
  | "wallpaper"
  | null;

const wallpapers = [
  { id: "rose-mist", name: "Розовый туман", color: "#f4d8df" },
  { id: "lavender-dusk", name: "Лавандовый вечер", color: "#ddd8f3" },
  { id: "sky-linen", name: "Небесный лён", color: "#d7e8f2" },
  { id: "mint-paper", name: "Мятная бумага", color: "#dcebdd" },
  { id: "peach-glow", name: "Персиковый свет", color: "#f4ddcc" },
] as const;
type Wallpaper = (typeof wallpapers)[number]["id"];
const widgetNames = {
  story: "Наша история",
  event: "Ближайшее событие",
  chat: "Быстрый чат",
  memories: "Воспоминания",
  distance: "Расстояние",
  notes: "Заметки",
  games: "Игры для двоих",
};
const empty: Snapshot = {
  user: null,
  room: null,
  entries: [],
  distance: null,
  locationShared: false,
  locationUpdated: null,
  csrf: "",
};
const labels: Record<EntryKind, string> = {
  event: "Календарь",
  memory: "Воспоминания",
  note: "Заметки",
  wish: "Желания",
  movie: "Фильмы",
  music: "Музыка",
};
const itemNames: Record<EntryKind, string> = {
  event: "событие",
  memory: "воспоминание",
  note: "заметку",
  wish: "желание",
  movie: "фильм",
  music: "музыку",
};
const icons = {
  event: CalendarDays,
  memory: Camera,
  note: NotebookPen,
  wish: Gift,
  movie: Film,
  music: Music2,
};
const nav = [
  { id: "home", name: "Главная", Icon: Home },
  { id: "chat", name: "Чат", Icon: MessageCircle },
  { id: "together", name: "Вместе", Icon: BookHeart },
  { id: "games", name: "Для двоих", Icon: Gamepad2 },
  { id: "settings", name: "Настройки", Icon: Settings },
] as const;
function today(zone = "Europe/Moscow") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function daysSince(date: string, zone: string) {
  return Math.max(
    0,
    Math.floor((Date.parse(today(zone)) - Date.parse(date)) / 86400000),
  );
}
function formatDate(date: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
  }).format(new Date(date + "T12:00:00Z"));
}
function code() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return (
    "LOOM-" +
    Array.from(bytes, (b) => alphabet[b % alphabet.length])
      .join("")
      .match(/.{1,4}/g)!
      .join("-")
  );
}
function pluralDays(n: number) {
  return n % 10 === 1 && n % 100 !== 11
    ? "день"
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
      ? "дня"
      : "дней";
}
function Logo({ large = false }: { large?: boolean }) {
  return (
    <div className={`brand ${large ? "large" : ""}`}>
      <Image
        src={asset("/loveloom-mark.png")}
        width={56}
        height={56}
        alt="Сердце из переплетённых нитей"
        priority
      />
      <span>
        LoveLoom<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function Avatar({ name, alt = false }: { name: string; alt?: boolean }) {
  return (
    <span className={`avatar ${alt ? "alt" : ""}`} aria-label={name}>
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}
function Empty({
  Icon = Heart,
  title,
  detail,
  action,
}: {
  Icon?: typeof Heart;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={27} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function LoveLoom({
  preview = false,
  cloud = false,
}: {
  preview?: boolean;
  cloud?: boolean;
}) {
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>([]);
  const [s, setS] = useState<Snapshot>(empty),
    [loading, setLoading] = useState(true),
    [offline, setOffline] = useState(false),
    [bootError, setBootError] = useState(false);
  const [tab, setTab] = useState<Tab>("home"),
    [section, setSection] = useState<EntryKind>("event"),
    [modal, setModal] = useState<Modal>(null);
  const [dark, setDark] = useState(false),
    [auth, setAuth] = useState<"login" | "register">("login"),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState("");
  const [pendingEmail, setPendingEmail] = useState(""),
    [wallpaper, setWallpaper] = useState<Wallpaper>("rose-mist"),
    [recording, setRecording] = useState(false);
  const [roomCode, setRoomCode] = useState(""),
    [reveal, setReveal] = useState(false),
    [entry, setEntry] = useState<Entry | null>(null);
  const [messages, setMessages] = useState<Message[]>([]),
    [hasMore, setHasMore] = useState(false),
    [messageText, setMessageText] = useState(""),
    [game, setGame] = useState<Game | null>(null);
  const [setupToken, setSetupToken] = useState(""),
    [admin, setAdmin] = useState<{
      users: {
        id: string;
        name: string;
        email: string;
        room: string | null;
        owner: string | null;
      }[];
      rooms: { id: string; created: number; billing: string }[];
    } | null>(null);
  const snapshot = useRef(s),
    requestSeq = useRef(0),
    chatBottom = useRef<HTMLDivElement>(null),
    scrollBox = useRef<HTMLDivElement>(null),
    stick = useRef(true),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    chatMediaInput = useRef<HTMLInputElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    voiceChunks = useRef<Blob[]>([]),
    voiceStream = useRef<MediaStream | null>(null);
  snapshot.current = s;
  useEffect(() => {
    document.body.classList.toggle("preview-mode", preview);
    document.body.classList.toggle("cloud-mode", cloud);
    try {
      const saved = JSON.parse(
        localStorage.getItem("loveloom-hidden-widgets") || "[]",
      );
      if (Array.isArray(saved))
        setHiddenWidgets(saved.filter((v) => typeof v === "string"));
    } catch {}
    if (!preview && !cloud && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      document.body.classList.remove("preview-mode");
      document.body.classList.remove("cloud-mode");
    };
  }, [preview, cloud]);
  const tell = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5500);
  }, []);
  const api = useCallback(
    async (path: string, body?: unknown, method = "POST") => {
      if (preview) return previewApi(path, body, method);
      if (cloud) return cloudApi(path, body, method);
      const response = await fetch("/api/" + path, {
        method: body === undefined ? "GET" : method,
        headers:
          body === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "X-CSRF-Token": snapshot.current.csrf,
              },
        body:
          body === undefined
            ? undefined
            : JSON.stringify({
                roomId: snapshot.current.room?.id,
                ...(body as object),
              }),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Не удалось выполнить действие.");
      return result;
    },
    [preview, cloud],
  );
  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const state: Snapshot = await api("state");
      if (seq !== requestSeq.current) return;
      const old = snapshot.current.room;
      if (
        old &&
        (old.id !== state.room?.id || old.epoch !== state.room?.epoch)
      ) {
        setMessages([]);
        setGame(null);
        setModal(null);
        tell("Состояние комнаты изменилось. Общая история обновлена.");
      }
      snapshot.current = state;
      setS(state);
      setOffline(false);
      setBootError(false);
    } catch {
      setOffline(true);
      if (!snapshot.current.user) setBootError(true);
    } finally {
      setLoading(false);
    }
  }, [api, tell]);
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 3500);
    const online = () => void refresh();
    window.addEventListener("online", online);
    const off = () => setOffline(true);
    window.addEventListener("offline", off);
    const saved = localStorage.getItem("loveloom-theme") === "dark";
    setDark(saved);
    document.documentElement.dataset.theme = saved ? "dark" : "light";
    if (location.hash.startsWith("#admin-setup=")) {
      setSetupToken(decodeURIComponent(location.hash.slice(13)));
      history.replaceState(null, "", location.pathname);
      setModal("admin");
    }
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", off);
    };
  }, [refresh]);
  useEffect(() => {
    if (!cloud) return;
    return onCloudAuthChange(() => void refresh());
  }, [cloud, refresh]);
  useEffect(() => {
    const roomId = s.room?.id;
    if (!roomId) {
      setWallpaper("rose-mist");
      return;
    }
    const saved = localStorage.getItem(`loveloom-wallpaper:${roomId}`);
    const valid = wallpapers.some((item) => item.id === saved);
    setWallpaper(valid ? (saved as Wallpaper) : "rose-mist");
  }, [s.room?.id]);
  useEffect(
    () => () => {
      const active = recorder.current;
      if (active && active.state !== "inactive") {
        active.onstop = null;
        active.stop();
      }
      voiceStream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  useEffect(() => {
    if (tab === "chat" && s.user) return;
    const active = recorder.current;
    const stream = voiceStream.current;
    if (!active && !stream) return;
    if (active && active.state !== "inactive") {
      active.onstop = null;
      active.stop();
    }
    stream?.getTracks().forEach((track) => track.stop());
    recorder.current = null;
    voiceStream.current = null;
    voiceChunks.current = [];
    setRecording(false);
  }, [tab, s.user?.id]);
  useEffect(() => {
    if (!s.user) return;
    const beat = () => {
      if (document.visibilityState === "visible")
        void api("presence", {}).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, 10000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [s.user?.id, api]);
  const fetchMessages = useCallback(async () => {
    try {
      const room = snapshot.current.room;
      if (!room) return;
      const result = await api("messages");
      if (
        snapshot.current.room?.id !== room.id ||
        snapshot.current.room.epoch !== result.epoch
      )
        return;
      setMessages((old) => {
        const byId = new Map(
          [...old, ...result.messages].map((m: Message) => [m.seq, m]),
        );
        return [...byId.values()].sort((a, b) => a.seq - b.seq);
      });
      setHasMore((prev) => prev || result.hasMore);
    } catch {}
  }, [api]);
  useEffect(() => {
    if (!s.room) return;
    if (tab === "chat") {
      void fetchMessages();
      const timer = setInterval(fetchMessages, 2000);
      return () => clearInterval(timer);
    }
    if (tab === "games") {
      const run = () =>
        void api("games")
          .then((result) => setGame(result.game))
          .catch(() => {});
      run();
      const timer = setInterval(run, 2500);
      return () => clearInterval(timer);
    }
  }, [s.room?.id, s.room?.epoch, tab, api, fetchMessages]);
  useEffect(() => {
    if (tab === "chat" && stick.current)
      chatBottom.current?.scrollIntoView({ behavior: "instant" });
  }, [messages, tab]);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("loveloom-theme", next ? "dark" : "light");
  }
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      tell(
        error instanceof Error
          ? error.message
          : "Не удалось выполнить действие.",
      );
    } finally {
      setBusy(false);
    }
  }
  const room = s.room,
    user = s.user,
    partner = room?.members.find((m) => m.id !== user?.id),
    partnerName = room?.nickname || partner?.name || "Ваш человек",
    owner = room?.owner === user?.id,
    online = partner ? Date.now() - partner.seen < 25000 : false;
  const date = room ? today(room.timezone) : "",
    days = room?.start ? daysSince(room.start, room.timezone) : null;
  const events = s.entries
    .filter((e) => e.kind === "event")
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextEvent = events.find((e) => e.date >= date),
    memories = s.entries.filter((e) => e.kind === "memory"),
    notes = s.entries.filter((e) => e.kind === "note");
  function openEntry(kind: EntryKind, existing: Entry | null = null) {
    setSection(kind);
    setEntry(existing);
    setModal("entry");
  }
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room?.code || "");
      tell("Пароль скопирован. Отправьте его только вашему человеку.");
    } catch {
      setReveal(true);
      tell("Выделите и скопируйте пароль вручную.");
    }
  }
  async function authSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") || "").trim().toLowerCase();
    await act(async () => {
      const result = await api(`auth/${auth}`, {
        name: f.get("name"),
        email,
        password: f.get("password"),
        ageConfirmed: f.get("age") === "on",
      });
      if (auth === "register" && result?.needsConfirmation) {
        setPendingEmail(email);
        setAuth("login");
        setModal("email");
        return;
      }
      await refresh();
    });
  }
  function jump(t: Tab) {
    setTab(t);
    if (t === "chat") stick.current = true;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const themeButton = (
    <button
      className="icon-button theme-button"
      onClick={toggleTheme}
      aria-label={dark ? "Светлая тема" : "Тёмная тема"}
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
  const credit = (
    <button
      className="creator"
      onClick={() => {
        setAdmin(null);
        setModal("admin");
      }}
    >
      Создатель <b>T&A</b>
      <ArrowUpRight size={12} />
    </button>
  );
  function coming() {
    setModal("call");
  }
  async function showPreview(
    screen: "room" | "lobby" | "auth" | "switch" | "reset",
  ) {
    previewScreen(screen);
    setMessages([]);
    setGame(null);
    setModal(null);
    if (screen !== "switch") setTab("home");
    await refresh();
    if (screen === "switch" && tab === "games")
      setGame((await api("games")).game);
    if (screen === "switch" && tab === "chat") await fetchMessages();
  }
  function changeWidget(id: string) {
    const next = hiddenWidgets.includes(id)
      ? hiddenWidgets.filter((v) => v !== id)
      : [...hiddenWidgets, id];
    setHiddenWidgets(next);
    localStorage.setItem("loveloom-hidden-widgets", JSON.stringify(next));
  }

  function chooseWallpaper(next: Wallpaper) {
    if (!room) return;
    setWallpaper(next);
    localStorage.setItem(`loveloom-wallpaper:${room.id}`, next);
    tell("Обои изменены на этом устройстве.");
  }

  async function uploadChatFile(file: File | null) {
    if (!file || !room || !user) return;
    if (!cloud) {
      tell("Медиа доступны в облачной beta-версии.");
      return;
    }
    await act(async () => {
      await api("media", {
        file,
        context: "chat",
        roomId: room.id,
        authorId: user.id,
        epoch: room.epoch,
      });
      stick.current = true;
      await fetchMessages();
      tell(file.type.startsWith("audio/") ? "Голосовое сообщение отправлено." : "Файл отправлен.");
    });
  }

  async function toggleVoiceRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!cloud) {
      tell("Голосовые сообщения доступны в облачной beta-версии.");
      return;
    }
    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      tell("Этот браузер не поддерживает запись голосовых сообщений.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStream.current = stream;
      const preferred = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ].find((mime) => MediaRecorder.isTypeSupported(mime));
      const nextRecorder = new MediaRecorder(
        stream,
        preferred ? { mimeType: preferred } : undefined,
      );
      voiceChunks.current = [];
      nextRecorder.ondataavailable = (event) => {
        if (event.data.size) voiceChunks.current.push(event.data);
      };
      nextRecorder.onstop = () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        voiceStream.current = null;
        recorder.current = null;
        const type = nextRecorder.mimeType || preferred || "audio/webm";
        const extension = type.startsWith("audio/mp4") ? "m4a" : "webm";
        const blob = new Blob(voiceChunks.current, { type });
        voiceChunks.current = [];
        if (!blob.size) {
          tell("Запись получилась пустой. Попробуйте ещё раз.");
          return;
        }
        const file = new File([blob], `voice-${Date.now()}.${extension}`, {
          type,
        });
        void uploadChatFile(file);
      };
      recorder.current = nextRecorder;
      nextRecorder.start(500);
      setRecording(true);
      tell("Запись началась. Нажмите квадрат, чтобы отправить.");
    } catch {
      tell("Не удалось получить доступ к микрофону.");
    }
  }

  if (loading)
    return (
      <div className="loading-screen">
        <Logo large />
        <LoaderCircle className="spin" />
        <span>Собираем ваше пространство…</span>
      </div>
    );
  if (bootError && !user)
    return (
      <div className="loading-screen">
        <Logo />
        <WifiOff />
        <h2>{cloud ? "Не удалось связаться с LoveLoom" : "Нет связи с локальным сервером"}</h2>
        <p>
          {cloud
            ? "Проверьте интернет и попробуйте ещё раз. Ваши данные остаются в облаке."
            : "Проверьте, что LoveLoom запущен."}
        </p>
        <button className="button" onClick={() => void refresh()}>
          Попробовать снова
        </button>
      </div>
    );
  return (
    <>
      {preview && (
        <div className="beta-bar" aria-label="Панель дизайн-беты">
          <strong>LoveLoom · sketch beta 0.4</strong>
          <span className="beta-description">
            Вымышленные данные · изменения только в этом браузере
          </span>
          <button onClick={() => void showPreview("room")}>Комната</button>
          <button onClick={() => void showPreview("lobby")}>
            Создать / войти
          </button>
          <button onClick={() => void showPreview("auth")}>Экран входа</button>
          {user && room && (
            <button onClick={() => void showPreview("switch")}>
              Роль: {user.name} ⇄
            </button>
          )}
          <button onClick={() => setModal("progress")}>Что готово?</button>
        </div>
      )}
      {offline && (
        <div className="offline-banner">
          <WifiOff size={17} />
          Нет соединения. Изменения пока не отправляются.
        </div>
      )}
      {!user ? (
        <main className="auth-shell">
          <header className="auth-header">
            <Logo />
            {themeButton}
          </header>
          <section className="auth-story">
            <div className="eyebrow">
              <span />
              ВАША ИСТОРИЯ. ВАШЕ МЕСТО.
            </div>
            <h1>
              Маленький мир.
              <br />
              <em>Только для двоих.</em>
            </h1>
            <p>
              Разговоры до ночи, общие планы и моменты,
              <br className="desktop-only" /> которые хочется сохранить.
            </p>
            <div className="hero-mark">
              <Image
                src={asset("/loveloom-mark.png")}
                width={340}
                height={340}
                alt="Множество нитей, сплетённых в сердце"
                priority
              />
              <span className="mark-caption">каждая нить — ваша история</span>
            </div>
            <div className="story-footer">
              <LockKeyhole size={17} />
              <span>Одна комната. Два человека. Всё ваше.</span>
            </div>
          </section>
          <section className="auth-card">
            <span className="tiny-label">ДОБРО ПОЖАЛОВАТЬ В LOVELOOM</span>
            <h2>
              {auth === "login" ? "Снова вместе." : "Начнём вашу историю."}
            </h2>
            <p className="muted">
              {auth === "login"
                ? "Войдите в своё пространство для двоих."
                : "Создайте аккаунт, а затем пригласите вашего человека."}
            </p>
            <div className="segmented" role="tablist" aria-label="Авторизация">
              <button
                role="tab"
                aria-selected={auth === "login"}
                className={auth === "login" ? "active" : ""}
                onClick={() => setAuth("login")}
              >
                Войти
              </button>
              <button
                role="tab"
                aria-selected={auth === "register"}
                className={auth === "register" ? "active" : ""}
                onClick={() => setAuth("register")}
              >
                Регистрация
              </button>
            </div>
            <form onSubmit={authSubmit} className="form-stack">
              {auth === "register" && (
                <label>
                  Ваше имя
                  <input
                    name="name"
                    defaultValue={preview ? "Алекс" : undefined}
                    readOnly={preview}
                    placeholder="Как к вам обращаться?"
                    autoComplete="given-name"
                    maxLength={40}
                    required
                  />
                </label>
              )}
              <label>
                Электронная почта
                <div className="input-icon">
                  <Mail size={18} />
                  <input
                    type="email"
                    name="email"
                    defaultValue={preview ? "alex@example.test" : undefined}
                    readOnly={preview}
                    autoComplete="email"
                    placeholder="you@example.com"
                    maxLength={254}
                    required
                  />
                </div>
              </label>
              <label>
                Пароль
                <div className="input-icon">
                  <LockKeyhole size={18} />
                  <input
                    name="password"
                    defaultValue={preview ? "preview-only" : undefined}
                    readOnly={preview}
                    type={reveal ? "text" : "password"}
                    autoComplete={
                      auth === "register" ? "new-password" : "current-password"
                    }
                    placeholder={
                      auth === "register"
                        ? "Не менее 10 символов"
                        : "Ваш пароль"
                    }
                    minLength={auth === "register" ? 10 : 1}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    className="input-eye"
                    onClick={() => setReveal(!reveal)}
                    aria-label={reveal ? "Скрыть пароль" : "Показать пароль"}
                  >
                    {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              {auth === "register" && (
                <label className="checkbox-label">
                  <input
                    name="age"
                    type="checkbox"
                    required
                    defaultChecked={preview}
                  />
                  Мне исполнилось 14 лет
                </label>
              )}
              <button className="button full" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <>
                    {auth === "login" ? "Войти в LoveLoom" : "Создать аккаунт"}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
            <p className="local-note">
              <Info size={16} />
              {preview
                ? "Предпросмотр экрана. Поля заполнены вымышленными данными и не создают аккаунт. Нажмите кнопку, чтобы посмотреть следующий экран."
                : cloud
                  ? "Облачная beta: сессия сохранится на этом устройстве. После регистрации может понадобиться подтверждение почты. Используйте отдельный пароль."
                  : "Локальная альфа: подтверждение почты и восстановление пароля ещё не подключены. Используйте тестовый адрес и отдельный пароль."}
            </p>
            <div className="auth-card-footer">
              <span>Создание комнаты сейчас бесплатно</span>
              <Heart size={15} />
            </div>
          </section>
          <footer className="auth-footer">
            <span>LoveLoom · пространство для двоих</span>
            {credit}
          </footer>
        </main>
      ) : !room ? (
        <main className="lobby">
          <header className="auth-header">
            <Logo />
            <div className="row">
              {themeButton}
              <button
                className="icon-button"
                aria-label="Выйти из аккаунта"
                onClick={() =>
                  void act(async () => {
                    await api("auth/logout", {});
                    await refresh();
                  })
                }
              >
                <LogOut size={20} />
              </button>
            </div>
          </header>
          <div className="lobby-content">
            <span className="eyebrow">
              РАДЫ ВАС ВИДЕТЬ, {user.name.toUpperCase()}
            </span>
            <h1>
              У каждой истории
              <br />
              есть <em>своё начало.</em>
            </h1>
            <p>
              Создайте ваше место или присоединитесь к тому,
              <br className="desktop-only" /> кто вас уже ждёт.
            </p>
            <div className="choice-grid">
              <button
                className="choice-card create-choice"
                onClick={() => {
                  setRoomCode(code());
                  setModal("create");
                }}
              >
                <span className="choice-icon">
                  <Plus size={28} />
                </span>
                <span className="free-tag">Бесплатно</span>
                <h2>Создать комнату</h2>
                <p>
                  Начните новую историю и пригласите
                  <br />
                  вашего человека.
                </p>
                <span className="choice-arrow">
                  <ArrowUpRight />
                </span>
              </button>
              <button
                className="choice-card"
                onClick={() => {
                  setRoomCode("");
                  setModal("join");
                }}
              >
                <span className="choice-icon">
                  <LockKeyhole size={26} />
                </span>
                <h2>Войти в комнату</h2>
                <p>
                  Есть пароль? Значит, вас уже ждут.
                  <br />
                  Осталось сделать один шаг.
                </p>
                <span className="choice-arrow">
                  <ArrowUpRight />
                </span>
              </button>
            </div>
            <div className="lobby-footnote">
              <ShieldCheck size={17} />В одной комнате только двое. В одном
              аккаунте — одна комната.
            </div>
          </div>
          <footer className="auth-footer">
            <span>{cloud ? "Облачная beta · без оплаты" : "Локальная альфа · без оплаты"}</span>
            {credit}
          </footer>
        </main>
      ) : (
        <div className={`app-shell wallpaper-${wallpaper}`}>
          <aside className="sidebar">
            <Logo />
            <div className="sidebar-caption">ВАШЕ ПРОСТРАНСТВО</div>
            <nav aria-label="Основная навигация">
              {nav.map(({ id, name, Icon }) => (
                <button
                  key={id}
                  className={`nav-item ${tab === id ? "active" : ""}`}
                  onClick={() => jump(id)}
                  aria-current={tab === id ? "page" : undefined}
                >
                  <Icon size={21} strokeWidth={1.7} />
                  <span>{name}</span>
                  {tab === id && <span className="nav-indicator" />}
                </button>
              ))}
            </nav>
            <div className="sidebar-note">
              <Heart size={21} strokeWidth={1.4} />
              <p>
                Большая история
                <br />
                из маленьких моментов.
              </p>
              <span>СОХРАНЯЙТЕ ВАШЕ</span>
            </div>
            <div className="sidebar-bottom">
              <div className="profile-mini">
                <Avatar name={user.name} />
                <div>
                  <strong>{user.name}</strong>
                  <span>
                    {owner ? "Создатель комнаты" : "Участник комнаты"}
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label="Выйти из аккаунта"
                  onClick={() =>
                    void act(async () => {
                      await api("auth/logout", {});
                      setTab("home");
                      setMessages([]);
                      await refresh();
                    })
                  }
                >
                  <LogOut size={18} />
                </button>
              </div>
              {credit}
            </div>
          </aside>
          <div className="app-main">
            <header className="topbar">
              <div className="breadcrumb">
                Наше пространство <span>/</span>
                <b>{nav.find((n) => n.id === tab)?.name}</b>
              </div>
              <div className="topbar-actions">
                <span className="private-label">
                  <LockKeyhole size={14} />
                  Только для двоих
                </span>
                {themeButton}
                <Avatar name={user.name} />
              </div>
            </header>
            <main
              className={`workspace ${tab === "chat" ? "chat-workspace" : ""}`}
            >
              {tab === "home" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">СОБИРАЕМ МОМЕНТЫ ВМЕСТЕ</div>
                      <h1>
                        Здесь начинается <em>«мы».</em>
                      </h1>
                      <p>Ваши разговоры, планы и маленькие радости.</p>
                    </div>
                    <div className="heading-actions">
                      <button
                        className="button secondary small"
                        onClick={() => setModal("widgets")}
                      >
                        <Settings size={17} />
                        Виджеты
                      </button>
                      <span className="date-pill">
                        <CalendarDays size={16} />
                        {formatDate(date)}
                      </span>
                    </div>
                  </div>
                  {!partner && (
                    <div className="invite-banner">
                      <span className="icon-tile">
                        <Users size={22} />
                      </span>
                      <div>
                        <strong>Это место ждёт ещё одного человека</strong>
                        <p>
                          Отправьте пароль вашей комнаты, чтобы начать вместе.
                        </p>
                      </div>
                      <button
                        className="button small secondary"
                        onClick={() => {
                          setReveal(false);
                          setModal("code");
                        }}
                      >
                        Пригласить
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                  )}
                  <div className="widget-launcher" aria-label="Быстрые виджеты">
                    {(Object.keys(labels) as EntryKind[]).map((kind) => {
                      const Icon = icons[kind];
                      const n = s.entries.filter((e) => e.kind === kind).length;
                      return (
                        <button
                          className="widget-tile"
                          key={kind}
                          onClick={() => {
                            setSection(kind);
                            jump("together");
                          }}
                        >
                          <Icon />
                          <span>
                            {labels[kind]}
                            <small>
                              {n ? `${n} записей` : "Добавить своё"}
                            </small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div
                    className="dashboard-grid"
                    data-hidden={hiddenWidgets.join(" ")}
                  >
                    <section className="together-hero">
                      <div className="hero-top">
                        <span className="pill">
                          <Heart size={14} />
                          НАША ИСТОРИЯ
                        </span>
                        <span className="two-avatars">
                          <Avatar name={user.name} />
                          {partner ? (
                            <Avatar name={partnerName} alt />
                          ) : (
                            <span className="avatar waiting">+</span>
                          )}
                        </span>
                      </div>
                      <h2>
                        {user.name}
                        <span>&</span>
                        {partnerName}
                      </h2>
                      <div className="relationship-number">
                        {days !== null ? (
                          <>
                            <strong>{days}</strong>
                            <div>
                              <span>{pluralDays(days)} вместе</span>
                              <small>
                                с {formatDate(room.start)}{" "}
                                {room.start.slice(0, 4)}
                              </small>
                            </div>
                          </>
                        ) : (
                          <>
                            <strong>∞</strong>
                            <div>
                              <span>впереди столько всего</span>
                              <small>Укажите дату начала вашей истории</small>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="hero-bottom">
                        <span>
                          <span
                            className={`presence-dot ${online ? "is-online" : ""}`}
                          />
                          {partner
                            ? online
                              ? "Сейчас рядом"
                              : "Пока не в приложении"
                            : "Ждём вашего человека"}
                        </span>
                        <button
                          onClick={() => setModal("story")}
                          aria-label="Открыть историю отношений"
                        >
                          <ArrowUpRight size={22} />
                        </button>
                      </div>
                      <Image
                        className="hero-watermark"
                        src={asset("/loveloom-mark.png")}
                        width={240}
                        height={240}
                        alt=""
                      />
                    </section>
                    <section className="card event-card">
                      <div className="card-label">
                        <span>
                          <CalendarDays size={18} />
                          Ближайшее событие
                        </span>
                        <button
                          className="icon-button"
                          onClick={() => openEntry("event")}
                          aria-label="Добавить событие"
                        >
                          <Plus size={19} />
                        </button>
                      </div>
                      {nextEvent ? (
                        <>
                          <span className="big-date">
                            {new Date(nextEvent.date + "T12:00Z").getUTCDate()}
                            <small>
                              {
                                new Intl.DateTimeFormat("ru", {
                                  day: "numeric",
                                  month: "long",
                                  timeZone: "UTC",
                                })
                                  .formatToParts(
                                    new Date(nextEvent.date + "T12:00Z"),
                                  )
                                  .find((part) => part.type === "month")?.value
                              }
                            </small>
                          </span>
                          <h3>{nextEvent.title}</h3>
                          <p>
                            {nextEvent.body || "Ещё один повод побыть вместе."}
                          </p>
                          <button
                            className="text-button"
                            onClick={() => {
                              setSection("event");
                              jump("together");
                            }}
                          >
                            Открыть календарь
                            <ArrowRight size={16} />
                          </button>
                        </>
                      ) : (
                        <Empty
                          Icon={CalendarDays}
                          title="Повод быть вместе"
                          detail="Добавьте событие, которого будете ждать вдвоём."
                          action={
                            <button
                              className="text-button"
                              onClick={() => openEntry("event")}
                            >
                              Добавить дату
                              <Plus size={15} />
                            </button>
                          }
                        />
                      )}
                    </section>
                    <section className="card quick-chat">
                      <div className="card-label">
                        <span>
                          <MessageCircle size={18} />
                          Ваш тихий уголок
                        </span>
                        <ArrowUpRight size={18} />
                      </div>
                      <h3>
                        Пара слов.
                        <br />
                        <em>А сколько в них тепла.</em>
                      </h3>
                      <p>Все ваши разговоры — в одном месте.</p>
                      <button
                        className="button secondary full"
                        onClick={() => jump("chat")}
                      >
                        Открыть чат
                        <MessageCircle size={17} />
                      </button>
                    </section>
                    <section className="card memories-card">
                      <div className="card-label">
                        <span>
                          <Camera size={18} />
                          Вспомнить хорошее
                        </span>
                        <button
                          className="text-button"
                          onClick={() => {
                            setSection("memory");
                            jump("together");
                          }}
                        >
                          Все
                          <ArrowRight size={14} />
                        </button>
                      </div>
                      {memories.length ? (
                        <div className="memory-preview">
                          <span className="memory-date">
                            {memories[0].date
                              ? formatDate(memories[0].date)
                              : "НАША ИСТОРИЯ"}
                          </span>
                          <h3>{memories[0].title}</h3>
                          <p>{memories[0].body}</p>
                          <button
                            className="text-button"
                            onClick={() => openEntry("memory", memories[0])}
                          >
                            Открыть воспоминание
                            <ArrowUpRight size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="memory-placeholder">
                          <BookHeart size={34} strokeWidth={1.3} />
                          <div>
                            <h3>У каждого момента своя нить</h3>
                            <p>Сохраните первое воспоминание.</p>
                          </div>
                          <button
                            className="circle-button"
                            onClick={() => openEntry("memory")}
                            aria-label="Добавить воспоминание"
                          >
                            <Plus size={20} />
                          </button>
                        </div>
                      )}
                    </section>
                    <section className="card distance-card">
                      <div className="card-label">
                        <span>
                          <MapPin size={18} />
                          Ближе, чем кажется
                        </span>
                        <Heart size={16} />
                      </div>
                      <div className="distance-visual">
                        <Avatar name={user.name} />
                        <span className="dotted-line" />
                        <span className="distance-heart">
                          <Heart size={18} />
                        </span>
                        <span className="dotted-line" />
                        <Avatar name={partnerName} alt />
                      </div>
                      {s.distance !== null ? (
                        <h3>
                          {s.distance}
                          <span> км между вами</span>
                        </h3>
                      ) : (
                        <h3>Расстояние — только цифра</h3>
                      )}
                      <p>
                        {s.distance !== null
                          ? "Примерно, по последнему обновлению."
                          : s.locationShared
                            ? "Ждём разрешение второго участника."
                            : "Поделитесь примерным местоположением."}
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setModal("location")}
                      >
                        {s.locationShared ? "Настроить" : "Поделиться"}
                        <ArrowRight size={16} />
                      </button>
                    </section>
                    <section className="card notes-card">
                      <div className="card-label">
                        <span>
                          <NotebookPen size={18} />
                          Не забыть
                        </span>
                        <button
                          className="icon-button"
                          aria-label="Добавить заметку"
                          onClick={() => openEntry("note")}
                        >
                          <Plus size={19} />
                        </button>
                      </div>
                      {notes.length ? (
                        notes.slice(0, 2).map((n) => (
                          <button
                            key={n.id}
                            className="note-preview"
                            onClick={() => openEntry("note", n)}
                          >
                            <span className="note-dot" />
                            {n.title}
                            <ArrowUpRight size={16} />
                          </button>
                        ))
                      ) : (
                        <p className="quiet-copy">
                          Мысли, списки и планы.
                          <br />
                          Место для всего, что важно вам.
                        </p>
                      )}
                      <button
                        className="text-button"
                        onClick={() => {
                          setSection("note");
                          jump("together");
                        }}
                      >
                        К заметкам
                        <ArrowRight size={16} />
                      </button>
                    </section>
                    <button
                      className="game-invite"
                      onClick={() => jump("games")}
                    >
                      <span className="game-invite-icon">
                        <Gamepad2 size={28} />
                      </span>
                      <div>
                        <span className="tiny-label">ПЯТЬ МИНУТ ДЛЯ ДВОИХ</span>
                        <h3>А давай сыграем?</h3>
                        <p>Узнайте друг о друге чуть больше.</p>
                      </div>
                      <span className="circle-button">
                        <ArrowUpRight size={23} />
                      </span>
                    </button>
                  </div>
                  <footer className="dashboard-footer">
                    <span>
                      <Heart size={14} />
                      Ваша комната уже{" "}
                      {daysSince(
                        new Date(room.created).toISOString().slice(0, 10),
                        room.timezone,
                      )}{" "}
                      {pluralDays(
                        daysSince(
                          new Date(room.created).toISOString().slice(0, 10),
                          room.timezone,
                        ),
                      )}{" "}
                      с вами
                    </span>
                    <button
                      className="text-button"
                      onClick={() => setModal("progress")}
                    >
                      <Sparkles size={14} />
                      {preview
                        ? "Sketch beta · посмотреть прогресс"
                        : "Бесплатная комната · прогресс"}
                    </button>
                  </footer>
                </>
              )}
              {tab === "chat" && (
                <>
                  <div className="chat-head">
                    <div className="row">
                      <Avatar name={partnerName} alt />
                      <div>
                        <h2>{partnerName}</h2>
                        <span className="muted">
                          <span
                            className={`presence-dot ${online ? "is-online" : ""}`}
                          />
                          {partner
                            ? online
                              ? "Сейчас рядом"
                              : "Пока не в приложении"
                            : "Ещё не присоединился"}
                        </span>
                      </div>
                    </div>
                    <button className="call-soon" onClick={coming}>
                      <Video size={21} />
                      <span>Звонки · скоро</span>
                    </button>
                  </div>
                  <div
                    className="chat-scroll"
                    ref={scrollBox}
                    onScroll={() => {
                      const el = scrollBox.current;
                      if (el)
                        stick.current =
                          el.scrollHeight - el.scrollTop - el.clientHeight <
                          100;
                    }}
                  >
                    {hasMore && (
                      <button
                        className="button secondary load-more"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            const result = await api(
                              "messages?before=" + messages[0]?.seq,
                            );
                            setMessages((old) => [...result.messages, ...old]);
                            setHasMore(result.hasMore);
                            stick.current = false;
                          })
                        }
                      >
                        Ранние сообщения
                        <ChevronLeft size={15} />
                      </button>
                    )}
                    {messages.length === 0 ? (
                      <Empty
                        Icon={MessageCircle}
                        title="Ваш разговор начинается здесь"
                        detail="Первое сообщение — маленькое начало большой истории."
                      />
                    ) : (
                      messages.map((m, i) => (
                        <div
                          key={m.id}
                          className={`message-row ${m.author === user.id ? "mine" : ""}`}
                        >
                          {(i === 0 ||
                            new Date(m.created).toDateString() !==
                              new Date(
                                messages[i - 1].created,
                              ).toDateString()) && (
                            <span className="message-day">
                              {new Intl.DateTimeFormat("ru", {
                                timeZone: room.timezone,
                                day: "numeric",
                                month: "long",
                              }).format(m.created)}
                            </span>
                          )}
                          <div className="message">
                            {m.media && <MediaBubble media={m.media} />}
                            {m.text && !m.media && <p>{m.text}</p>}
                            <time>
                              {new Intl.DateTimeFormat("ru", {
                                timeZone: room.timezone,
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(m.created)}
                            </time>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatBottom} />
                  </div>
                  <form
                    className="message-compose"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act(async () => {
                        await api("messages", {
                          text: messageText,
                          epoch: room.epoch,
                        });
                        setMessageText("");
                        stick.current = true;
                        await fetchMessages();
                      });
                    }}
                  >
                    <input
                      ref={chatMediaInput}
                      hidden
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        event.currentTarget.value = "";
                        void uploadChatFile(file);
                      }}
                    />
                    <div className="compose-tools">
                      <button
                        type="button"
                        className="compose-tool"
                        disabled={busy || offline || recording}
                        onClick={() => chatMediaInput.current?.click()}
                        aria-label="Прикрепить фотографию или видео"
                      >
                        <Paperclip size={19} />
                      </button>
                      <button
                        type="button"
                        className={`compose-tool voice-tool ${recording ? "is-recording" : ""}`}
                        disabled={busy || offline}
                        onClick={() => void toggleVoiceRecording()}
                        aria-label={
                          recording
                            ? "Остановить и отправить запись"
                            : "Записать голосовое сообщение"
                        }
                      >
                        {recording ? (
                          <Square size={16} fill="currentColor" />
                        ) : (
                          <Mic size={19} />
                        )}
                      </button>
                    </div>
                    <textarea
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      aria-label="Сообщение"
                      placeholder="Напишите что-нибудь тёплое…"
                      rows={1}
                      maxLength={4000}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }
                      }}
                    />
                    <button
                      className="send-button"
                      disabled={busy || !messageText.trim() || offline}
                      aria-label="Отправить сообщение"
                    >
                      <Send size={20} />
                    </button>
                  </form>
                  <p className="chat-footnote">
                    <LockKeyhole size={12} />
                    Текст, фото, видео и голосовые · звонки пока не подключены
                  </p>
                </>
              )}
              {tab === "together" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">ТО, ЧТО ОБЪЕДИНЯЕТ</div>
                      <h1>
                        Ваше <em>«однажды».</em>
                      </h1>
                      <p>
                        Планы, которые хочется строить. Моменты, которые хочется
                        помнить.
                      </p>
                    </div>
                    <button
                      className="button"
                      onClick={() => openEntry(section)}
                    >
                      <Plus size={18} />
                      Добавить {itemNames[section]}
                    </button>
                  </div>
                  <div
                    className="section-tabs"
                    role="tablist"
                    aria-label="Общие разделы"
                  >
                    {(Object.keys(labels) as EntryKind[]).map((kind) => {
                      const Icon = icons[kind];
                      return (
                        <button
                          key={kind}
                          className={section === kind ? "active" : ""}
                          role="tab"
                          aria-selected={section === kind}
                          onClick={() => setSection(kind)}
                        >
                          <Icon size={17} />
                          {labels[kind]}
                        </button>
                      );
                    })}
                  </div>
                  {section === "event" && (
                    <CalendarMini
                      events={events}
                      today={date}
                      onSelect={(e) => openEntry("event", e)}
                    />
                  )}
                  <div className="entries-heading">
                    <h2>{labels[section]}</h2>
                    <span>
                      {s.entries.filter((e) => e.kind === section).length}{" "}
                      записей
                    </span>
                  </div>
                  <div className="entries-grid">
                    {s.entries
                      .filter((e) => e.kind === section)
                      .map((e) => {
                        const Icon = icons[e.kind];
                        return (
                          <article
                            className={`entry-card ${e.done ? "done" : ""}`}
                            key={e.id}
                          >
                            <div className="card-label">
                              <span>
                                <Icon size={18} />
                                {e.date ? formatDate(e.date) : labels[e.kind]}
                              </span>
                              <button
                                className="icon-button"
                                aria-label={"Изменить " + e.title}
                                onClick={() => openEntry(e.kind, e)}
                              >
                                <Pencil size={16} />
                              </button>
                            </div>
                            <h3>{e.title}</h3>
                            <p>
                              {e.body || "Маленькая часть вашей общей истории."}
                            </p>
                            <div className="entry-footer">
                              <span>
                                {e.author === user.id
                                  ? "Добавлено вами"
                                  : "Добавлено партнёром"}
                              </span>
                              {["wish", "movie", "music"].includes(e.kind) && (
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(async () => {
                                      await api("entries", {
                                        ...e,
                                        done: !e.done,
                                        epoch: room.epoch,
                                      });
                                      await refresh();
                                    })
                                  }
                                >
                                  {e.done ? (
                                    <CheckCircle2 size={19} />
                                  ) : (
                                    <span className="empty-check" />
                                  )}
                                  {e.done ? "Готово" : "Отметить"}
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                  </div>
                  {!s.entries.some((e) => e.kind === section) && (
                    <div className="card spacious">
                      <Empty
                        Icon={icons[section]}
                        title={
                          {
                            event: "Пусть будет чего ждать",
                            memory: "Моменты становятся историей",
                            note: "Запишите, пока не забыли",
                            wish: "Мечтать приятнее вдвоём",
                            movie: "Что посмотрим вместе?",
                            music: "Ваш общий саундтрек",
                          }[section]
                        }
                        detail="Здесь пока чистый лист. Добавьте первую запись — она появится у вас обоих."
                        action={
                          <button
                            className="button secondary"
                            onClick={() => openEntry(section)}
                          >
                            <Plus size={17} />
                            Добавить {itemNames[section]}
                          </button>
                        }
                      />
                    </div>
                  )}
                </>
              )}
              {tab === "games" && (
                <>
                  <MomentsHub
                    api={api}
                    room={room}
                    user={user}
                    partnerName={partnerName}
                    hasPartner={Boolean(partner)}
                    cloud={cloud}
                    tell={tell}
                  />
                  <div className="page-heading games-heading">
                    <div>
                      <div className="eyebrow">ВРЕМЯ ДЛЯ ВАС</div>
                      <h1>
                        Немного игры.
                        <br />
                        <em>Ещё больше общего.</em>
                      </h1>
                      <p>Никакой спешки. Только вы и новый повод улыбнуться.</p>
                    </div>
                    <Gamepad2
                      className="page-illustration"
                      size={75}
                      strokeWidth={1}
                    />
                  </div>
                  <div className="games-grid">
                    {[
                      {
                        id: "know",
                        title: "Знаю тебя",
                        subtitle: "Предугадайте выбор друг друга",
                        n: "01",
                        icon: Heart,
                      },
                      {
                        id: "quiz",
                        title: "Сравним ответы",
                        subtitle: "Небольшая викторина на двоих",
                        n: "02",
                        icon: Sparkles,
                      },
                      {
                        id: "either",
                        title: "Одно из двух",
                        subtitle: "Море или горы? Давайте узнаем",
                        n: "03",
                        icon: Gamepad2,
                      },
                      {
                        id: "date",
                        title: "Что сделаем вместе?",
                        subtitle: "Идея для вашего следующего дня",
                        n: "04",
                        icon: Sun,
                      },
                    ].map((g) => (
                      <button
                        key={g.id}
                        className={`game-card game-${g.id}`}
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await api("games", {
                              kind: g.id,
                              epoch: room.epoch,
                            });
                            setGame((await api("games")).game);
                          })
                        }
                      >
                        <div className="card-label">
                          <g.icon size={28} strokeWidth={1.5} />
                          <span>{g.n}</span>
                        </div>
                        <h2>{g.title}</h2>
                        <p>{g.subtitle}</p>
                        <span className="game-start">
                          {partner ? "Начать раунд" : "Нужны два участника"}
                          <ArrowUpRight size={21} />
                        </span>
                      </button>
                    ))}
                  </div>
                  {game && (
                    <section className="card round-card">
                      <div className="eyebrow">
                        {game.complete ? "ВАШИ ОТВЕТЫ" : "ТЕКУЩИЙ РАУНД"}
                      </div>
                      <h2>{game.question}</h2>
                      {!game.responses.some((r) => r.user === user.id) ? (
                        game.kind === "know" ? (
                          <form
                            className="form-stack"
                            key={game.id}
                            onSubmit={(e) => {
                              e.preventDefault();
                              const form = new FormData(e.currentTarget);
                              void act(async () => {
                                await api("games", {
                                  action: "answer",
                                  id: game.id,
                                  answer: form.get("answer"),
                                  guess: form.get("guess"),
                                  epoch: room.epoch,
                                });
                                setGame((await api("games")).game);
                              });
                            }}
                          >
                            <label>
                              Ваш собственный выбор
                              <select name="answer" required defaultValue="">
                                <option value="" disabled>
                                  Выберите ответ
                                </option>
                                {game.choices.map((c) => (
                                  <option key={c}>{c}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Как, по-вашему, ответит партнёр?
                              <select name="guess" required defaultValue="">
                                <option value="" disabled>
                                  Попробуйте угадать
                                </option>
                                {game.choices.map((c) => (
                                  <option key={c}>{c}</option>
                                ))}
                              </select>
                            </label>
                            <button className="button" disabled={busy}>
                              Отправить ответы
                              <Check size={17} />
                            </button>
                          </form>
                        ) : (
                          <div className="answer-grid">
                            {game.choices.map((answer) => (
                              <button
                                className="button secondary"
                                key={answer}
                                disabled={busy}
                                onClick={() =>
                                  void act(async () => {
                                    await api("games", {
                                      action: "answer",
                                      id: game.id,
                                      answer,
                                      epoch: room.epoch,
                                    });
                                    setGame((await api("games")).game);
                                  })
                                }
                              >
                                {answer}
                              </button>
                            ))}
                          </div>
                        )
                      ) : !game.complete ? (
                        <p className="round-wait">
                          <Clock size={19} />
                          Ваш ответ принят. Ответ партнёра скрыт, пока не
                          ответят оба.
                        </p>
                      ) : (
                        <div className="answer-grid">
                          {game.responses.map((r) => (
                            <div className="answer-result" key={r.user}>
                              <Avatar
                                name={
                                  r.user === user.id ? user.name : partnerName
                                }
                              />
                              <span>
                                <strong>
                                  {r.user === user.id
                                    ? "Ваш ответ"
                                    : partnerName}
                                </strong>
                                {r.answer}
                                {r.guess && (
                                  <small className="game-score">
                                    Прогноз: {r.guess}
                                    <br />
                                    {r.guess ===
                                    game.responses.find(
                                      (other) => other.user !== r.user,
                                    )?.answer
                                      ? "Выбор партнёра угадан!"
                                      : "В этот раз партнёр выбрал иначе."}
                                  </small>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {game.correctAnswer && (
                        <p className="quiz-result">
                          <CheckCircle2 size={18} />
                          Правильный ответ: {game.correctAnswer}
                        </p>
                      )}
                    </section>
                  )}
                  <div className="privacy-note">
                    <LockKeyhole size={16} />
                    Ответы друг друга открываются только после выбора обоих
                    участников.
                  </div>
                </>
              )}
              {tab === "settings" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">СДЕЛАЙТЕ ЭТО МЕСТО СВОИМ</div>
                      <h1>
                        Всё <em>по-вашему.</em>
                      </h1>
                      <p>Немного настроек для вашего маленького мира.</p>
                    </div>
                  </div>
                  <div className="settings-grid">
                    <section className="card setting-card">
                      <h2>
                        <Heart size={20} />
                        Ваша комната
                      </h2>
                      <form
                        className="form-stack"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const data = new FormData(e.currentTarget);
                          void act(async () => {
                            await api("room", {
                              action: "update",
                              nickname: data.get("nickname"),
                              ...(owner
                                ? {
                                    start: data.get("start"),
                                    timezone: data.get("timezone"),
                                  }
                                : {}),
                              epoch: room.epoch,
                            });
                            await refresh();
                            tell("Настройки сохранены.");
                          });
                        }}
                      >
                        <label>
                          Как вы называете партнёра
                          <input
                            name="nickname"
                            defaultValue={room.nickname}
                            key={room.id + "nickname"}
                            placeholder={partner?.name || "Ваш человек"}
                            maxLength={40}
                          />
                          <small>Это имя видно только вам.</small>
                        </label>
                        {owner && (
                          <>
                            <label>
                              Дата начала отношений
                              <input
                                type="date"
                                name="start"
                                defaultValue={room.start}
                                max={today(room.timezone)}
                              />
                            </label>
                            <label>
                              Общий часовой пояс
                              <select
                                name="timezone"
                                defaultValue={room.timezone}
                              >
                                {[
                                  "Europe/Moscow",
                                  "Europe/Istanbul",
                                  "Europe/Kaliningrad",
                                  "Asia/Yekaterinburg",
                                  "Asia/Novosibirsk",
                                  "Asia/Vladivostok",
                                  "Asia/Almaty",
                                  "Asia/Yerevan",
                                  "Europe/Minsk",
                                  "UTC",
                                ].map((z) => (
                                  <option key={z}>{z}</option>
                                ))}
                              </select>
                            </label>
                          </>
                        )}
                        <button className="button" disabled={busy}>
                          Сохранить
                          <Check size={17} />
                        </button>
                      </form>
                    </section>
                    <section className="card setting-card">
                      <h2>
                        <Settings size={20} />
                        Комфорт и приватность
                      </h2>
                      <div className="setting-row">
                        <div>
                          <strong>Оформление</strong>
                          <p>{dark ? "Тёмная" : "Светлая"} тема</p>
                        </div>
                        {themeButton}
                      </div>
                      <div className="setting-row">
                        <div>
                          <strong>Обои комнаты</strong>
                          <p>
                            {wallpapers.find((item) => item.id === wallpaper)?.name}
                          </p>
                        </div>
                        <button
                          className="button secondary small"
                          onClick={() => setModal("wallpaper")}
                        >
                          <Palette size={16} />
                          Выбрать
                        </button>
                      </div>
                      <div className="setting-row">
                        <div>
                          <strong>Пароль комнаты</strong>
                          <p>Передавайте только вашему человеку</p>
                        </div>
                        <button
                          className="button secondary small"
                          onClick={() => {
                            setReveal(false);
                            setModal("code");
                          }}
                        >
                          Показать
                        </button>
                      </div>
                      <div className="setting-row">
                        <div>
                          <strong>Примерное местоположение</strong>
                          <p>
                            {s.locationShared
                              ? "Вы поделились местоположением"
                              : "Вы не делитесь местоположением"}
                          </p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Настроить местоположение"
                          onClick={() => setModal("location")}
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>
                      <div className="setting-row">
                        <div>
                          <strong>Push-уведомления</strong>
                          <p>Ещё не подключены</p>
                        </div>
                        <span className="soon-tag">Позже</span>
                      </div>
                      <div className="setting-row">
                        <div>
                          <strong>Медиахранилище</strong>
                          <p>Закрытый облачный альбом и файлы чата</p>
                        </div>
                        <span className="soon-tag is-ready">Готово</span>
                      </div>
                      <div className="setting-row">
                        <div>
                          <strong>Экспорт общей истории</strong>
                          <p>Будет доступен с согласием обоих</p>
                        </div>
                        <span className="soon-tag">Позже</span>
                      </div>
                    </section>
                    <section className="card danger-card">
                      <div>
                        <h2>
                          {owner ? "Удаление комнаты" : "Выход из комнаты"}
                        </h2>
                        <p>
                          {owner
                            ? "Комната и вся общая история будут удалены у обоих."
                            : "Вся общая история будет удалена у обоих. Комната останется у создателя."}
                          <br />
                          Без возможности восстановления в приложении.
                        </p>
                      </div>
                      <button
                        className="button danger"
                        onClick={() => setModal(owner ? "delete" : "leave")}
                      >
                        {owner ? <Trash2 size={17} /> : <LogOut size={17} />}{" "}
                        {owner ? "Удалить комнату" : "Выйти из комнаты"}
                      </button>
                    </section>
                  </div>
                </>
              )}
            </main>
            <div className="mobile-credit">{credit}</div>
          </div>
          <nav className="bottom-nav" aria-label="Мобильная навигация">
            {nav.map(({ id, name, Icon }) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => jump(id)}
              >
                <Icon size={21} />
                <span>{id === "settings" ? "Профиль" : name}</span>
              </button>
            ))}
          </nav>
        </div>
      )}
      {modal && (
        <Dialog
          title={
            {
              create: "Место, где будете вы",
              join: "Вас уже ждут",
              code: "Пароль вашей комнаты",
              entry: entry ? "Ваша запись" : "Ещё одна нить вашей истории",
              leave: "Выйти и удалить историю?",
              delete: "Удалить вашу комнату?",
              location: "Ближе, даже на расстоянии",
              admin: setupToken
                ? "Первый вход владельца"
                : "Вход администратора",
              about: "О текущей версии",
              widgets: "Собери своё пространство",
              story: "Наша история — по дням",
              call: "Побыть рядом",
              progress: "LoveLoom · что уже готово",
              email: "Подтвердите почту",
              wallpaper: "Обои вашего пространства",
            }[modal]
          }
          onClose={() => {
            if (!busy) {
              setModal(null);
              setSetupToken("");
            }
          }}
        >
          {modal === "email" && (
            <div className="form-stack email-confirmation">
              <span className="confirmation-orbit">
                <Mail size={32} />
              </span>
              <h3>Письмо уже в пути</h3>
              <p>
                Мы отправили ссылку подтверждения на{" "}
                <strong>{pendingEmail}</strong>. Откройте её на этом устройстве,
                затем войдите в LoveLoom.
              </p>
              <div className="inline-notice">
                <ShieldCheck size={20} />
                <span>
                  Если письма нет, проверьте папку «Спам» и правильность адреса.
                </span>
              </div>
              <button
                className="button full"
                disabled={busy || !pendingEmail || !cloud}
                onClick={() =>
                  void act(async () => {
                    await api("auth/resend", { email: pendingEmail });
                    tell("Новое письмо отправлено.");
                  })
                }
              >
                <Mail size={18} />
                Отправить письмо ещё раз
              </button>
              <button
                className="button secondary full"
                onClick={() => setModal(null)}
              >
                Перейти ко входу
              </button>
            </div>
          )}
          {modal === "wallpaper" && (
            <div className="form-stack">
              <p className="muted">
                Нежный фон сохранится для этой комнаты на текущем устройстве.
              </p>
              <div className="wallpaper-options">
                {wallpapers.map((item) => (
                  <button
                    key={item.id}
                    className={`wallpaper-option wallpaper-preview-${item.id} ${wallpaper === item.id ? "is-selected" : ""}`}
                    onClick={() => chooseWallpaper(item.id)}
                  >
                    <span
                      className="wallpaper-swatch"
                      style={{ backgroundColor: item.color }}
                    >
                      <Heart size={21} fill="currentColor" />
                    </span>
                    <strong>{item.name}</strong>
                    {wallpaper === item.id && <Check size={18} />}
                  </button>
                ))}
              </div>
              <button className="button full" onClick={() => setModal(null)}>
                <Check size={18} />
                Готово
              </button>
            </div>
          )}
          {modal === "widgets" && (
            <div className="form-stack">
              <p className="muted">
                Оставьте на главной то, что вам нравится. Настройки сохраняются
                на этом устройстве.
              </p>
              <div className="widget-options">
                {Object.entries(widgetNames).map(([id, name]) => (
                  <label className="widget-option" key={id}>
                    <span>{name}</span>
                    <input
                      type="checkbox"
                      checked={!hiddenWidgets.includes(id)}
                      onChange={() => changeWidget(id)}
                    />
                  </label>
                ))}
              </div>
              <button className="button full" onClick={() => setModal(null)}>
                <Check size={18} />
                Вот так нравится
              </button>
            </div>
          )}
          {modal === "story" && room && (
            <div className="form-stack">
              <p className="handwritten-note">
                Из маленьких моментов складывается большое «мы».
              </p>
              <span className="story-number">{days ?? "∞"}</span>
              <p>
                {days === null
                  ? "Выберите дату начала вашей истории."
                  : `${pluralDays(days)} вместе · с ${formatDate(room.start)}`}
              </p>
              <div className="inline-notice">
                <Heart size={20} />
                <span>
                  Комната с вами уже{" "}
                  {daysSince(
                    new Date(room.created).toISOString().slice(0, 10),
                    room.timezone,
                  )}{" "}
                  дней.
                </span>
              </div>
              <button
                className="button"
                onClick={() => {
                  setModal(null);
                  setSection("memory");
                  jump("together");
                }}
              >
                <Camera size={18} />
                Открыть воспоминания
              </button>
              {owner && (
                <button
                  className="button secondary"
                  onClick={() => {
                    setModal(null);
                    jump("settings");
                  }}
                >
                  <Pencil size={18} />
                  Изменить дату
                </button>
              )}
            </div>
          )}
          {modal === "call" && (
            <div className="form-stack">
              <div className="empty-state">
                <Video size={48} />
                <h3>Место для ваших разговоров</h3>
                <p>
                  Аудио и видео ещё не подключены. Здесь появится общий звонок
                  комнаты, в который можно зайти и выйти в любой момент.
                </p>
              </div>
              <div className="inline-notice">
                <LockKeyhole size={20} />
                <span>
                  Сейчас камера и микрофон не включаются. Записи звонков не
                  планируются.
                </span>
              </div>
              <button
                className="button full"
                onClick={() => {
                  setModal(null);
                  jump("chat");
                }}
              >
                <MessageCircle size={18} />
                Пока — в чат
              </button>
            </div>
          )}
          {(modal === "progress" || modal === "about") && (
            <div className="form-stack">
              <p className="handwritten-note">
                Блокнот для двоих. Версия 0.4 beta.
              </p>
              <p>
                {preview
                  ? "Это интерактивная дизайн-бета. Можно менять записи, открывать виджеты и примерять обе роли. Настоящей регистрации, общей базы и связи между устройствами здесь нет."
                  : cloud
                    ? "Это рабочая облачная beta. Аккаунт, комната, чат и общие записи сохраняются в базе и синхронизируются между двумя устройствами."
                    : "Локальная версия с серверной базой. Следующий этап — подключение облака для двух разных устройств."}
              </p>
              <ul className="progress-list">
                <li>
                  <strong>{cloud ? "Работает в облаке" : "Можно попробовать"}</strong>
                  Регистрация, постоянный вход, комнаты для двоих, чат,
                  календарь, заметки, желания, фильмы, музыка, расстояние и
                  четыре мини-игры. Добавлены фото, видео, голосовые сообщения,
                  общий альбом, капсулы времени, сад и тактильный сигнал.
                </li>
                <li>
                  <strong>Следующий этап</strong>Восстановление доступа,
                  push-уведомления и окончательная настройка фирменной почты.
                </li>
                <li>
                  <strong>После подключения связи</strong>Аудио- и видеозвонки в
                  своей комнате.
                </li>
              </ul>
              {preview && (
                <>
                  <p className="muted">
                    Чтобы проверить оба ответа в игре, переключайте роль в
                    верхней панели. Не вводите личные данные или настоящие
                    пароли.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => void showPreview("reset")}
                  >
                    <RefreshCw size={18} />
                    Вернуть тестовые примеры
                  </button>
                </>
              )}
            </div>
          )}
          {(modal === "create" || modal === "join") && (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void act(async () => {
                  await api("room", {
                    action: modal === "create" ? "create" : "join",
                    code: roomCode,
                    start: form.get("start") || "",
                    timezone: form.get("timezone") || "Europe/Moscow",
                  });
                  await refresh();
                  setModal(null);
                  setTab("home");
                  tell(
                    modal === "create"
                      ? "Ваша комната создана. Пригласите вашего человека."
                      : "Вы дома. Начинается новая история.",
                  );
                });
              }}
            >
              {modal === "create" ? (
                <p className="muted">
                  Создание бесплатно. Никаких подписок и платёжных данных.
                </p>
              ) : (
                <p className="muted">
                  Введите пароль, которым с вами поделился создатель комнаты.
                </p>
              )}
              <label>
                Пароль комнаты
                <div className="code-input">
                  <input
                    aria-label="Пароль комнаты"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    maxLength={64}
                    minLength={10}
                    pattern="[A-Za-z0-9-]{10,64}"
                    placeholder="LOOM-XXXX-XXXX-XXXX"
                    required
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {modal === "create" && (
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => setRoomCode(code())}
                      aria-label="Сгенерировать новый пароль"
                    >
                      <RefreshCw size={18} />
                    </button>
                  )}
                </div>
                <small>
                  {modal === "create"
                    ? "Предложенный пароль можно изменить. Совпадения не допускаются."
                    : "Буквы, цифры и дефисы. Не пароль от аккаунта."}
                </small>
              </label>
              {modal === "create" && (
                <>
                  <label>
                    Когда началась ваша история?
                    <input name="start" type="date" max={today()} />
                    <small>Можно указать позже.</small>
                  </label>
                  <label>
                    Ваш общий часовой пояс
                    <select name="timezone" defaultValue="Europe/Moscow">
                      {[
                        "Europe/Moscow",
                        "Europe/Istanbul",
                        "Asia/Yekaterinburg",
                        "Asia/Almaty",
                        "Asia/Yerevan",
                        "UTC",
                      ].map((z) => (
                        <option key={z}>{z}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <div className="inline-notice">
                <LockKeyhole size={20} />
                <span>
                  В комнате не может быть больше двух человек. Выход
                  приглашённого участника удалит всю общую историю.
                </span>
              </div>
              <button className="button full" disabled={busy}>
                {modal === "create" ? "Создать бесплатно" : "Присоединиться"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          {modal === "code" && room && (
            <div className="form-stack">
              <p className="muted">
                Этот пароль открывает вход в вашу комнату, пока в ней есть
                место. Передавайте его только вашему человеку.
              </p>
              <div className="secret-code">
                <span>{reveal ? room.code : "•••• — •••• — ••••"}</span>
                <button
                  className="icon-button"
                  aria-label={reveal ? "Скрыть" : "Показать"}
                  onClick={() => setReveal(!reveal)}
                >
                  {reveal ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <button className="button full" onClick={() => void copyCode()}>
                <Copy size={17} />
                Скопировать пароль
              </button>
            </div>
          )}
          {modal === "entry" && room && (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void act(async () => {
                  await api("entries", {
                    id: entry?.id,
                    version: entry?.version,
                    kind: section,
                    title: form.get("title"),
                    body: form.get("body"),
                    date: form.get("date") || "",
                    done: entry?.done || 0,
                    epoch: room.epoch,
                  });
                  await refresh();
                  setModal(null);
                  tell("Сохранено в вашей общей истории.");
                });
              }}
            >
              <label>
                Название
                <input
                  name="title"
                  defaultValue={entry?.title || ""}
                  maxLength={140}
                  placeholder={
                    {
                      event: "Вечер только для нас",
                      memory: "Тот самый день",
                      note: "Важно не забыть",
                      wish: "Однажды мы…",
                      movie: "Название фильма",
                      music: "Песня или исполнитель",
                    }[section]
                  }
                  required
                />
              </label>
              {["event", "memory"].includes(section) && (
                <label>
                  Дата
                  <input
                    name="date"
                    type="date"
                    defaultValue={entry?.date || today(room.timezone)}
                    required={section === "event"}
                  />
                </label>
              )}
              <label>
                {section === "music" || section === "movie"
                  ? "Заметка или ссылка"
                  : "Несколько слов"}
                <textarea
                  name="body"
                  rows={4}
                  defaultValue={entry?.body || ""}
                  maxLength={4000}
                  placeholder="Пусть здесь останется то, что важно вам."
                />
              </label>
              {section === "memory" && (
                <p className="local-note">
                  Фотографии можно хранить в общем альбоме раздела «Для двоих».
                </p>
              )}
              <div className="row">
                {entry && (
                  <button
                    type="button"
                    className="button danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm("Удалить эту запись у обоих участников?")
                      )
                        void act(async () => {
                          await api(
                            "entries",
                            { id: entry.id, epoch: room.epoch },
                            "DELETE",
                          );
                          await refresh();
                          setModal(null);
                        });
                    }}
                  >
                    <Trash2 size={17} />
                    Удалить
                  </button>
                )}
                <button className="button grow" disabled={busy}>
                  Сохранить
                  <Check size={17} />
                </button>
              </div>
            </form>
          )}
          {(modal === "leave" || modal === "delete") && room && (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void act(async () => {
                  await api("room", {
                    action: modal === "delete" ? "delete" : "leave",
                    confirm: data.get("confirm"),
                    epoch: room.epoch,
                  });
                  setModal(null);
                  setMessages([]);
                  setGame(null);
                  await refresh();
                  tell("Общая история удалена у обоих участников.");
                });
              }}
            >
              <div className="inline-notice warning">
                <Trash2 />
                <span>
                  Исчезнут переписка, события, воспоминания, заметки, желания,
                  списки и ответы в играх. Это действие нельзя отменить.
                </span>
              </div>
              <label>
                Для подтверждения введите «
                {modal === "delete" ? "УДАЛИТЬ КОМНАТУ" : "УДАЛИТЬ ИСТОРИЮ"}»
                <input name="confirm" autoComplete="off" required />
              </label>
              <button className="button danger full" disabled={busy}>
                Подтвердить удаление
              </button>
              <button
                className="button secondary full"
                type="button"
                onClick={() => setModal(null)}
              >
                Остаться
              </button>
            </form>
          )}
          {modal === "location" && room && (
            <div className="form-stack">
              <div className="location-intro">
                <MapPin size={35} />
                <h3>
                  {s.distance !== null
                    ? `Примерно ${s.distance} км`
                    : "У расстояния нет последнего слова"}
                </h3>
              </div>
              <p className="muted">
                Сохраняем округлённое местоположение, не точный адрес. Партнёр
                видит только расстояние. Обновление — только по вашему нажатию,
                без фонового слежения.
              </p>
              {s.locationUpdated && (
                <small>
                  Последнее общее обновление:{" "}
                  {new Date(s.locationUpdated).toLocaleString("ru")}
                </small>
              )}
              <button
                className="button full"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    if (preview)
                      throw new Error(
                        "В дизайн-бете геолокация не собирается. Можно оценить виджет; настоящий расчёт расстояния будет доступен после подключения сервера.",
                      );
                    if (!navigator.geolocation)
                      throw new Error("Браузер не поддерживает геолокацию.");
                    const pos = await new Promise<GeolocationPosition>(
                      (resolve, reject) =>
                        navigator.geolocation.getCurrentPosition(
                          resolve,
                          () =>
                            reject(
                              new Error(
                                "Доступ не получен. Проверьте разрешение браузера.",
                              ),
                            ),
                          {
                            enableHighAccuracy: false,
                            timeout: 12000,
                            maximumAge: 60000,
                          },
                        ),
                    );
                    await api("location", {
                      lat: Math.round(pos.coords.latitude * 10) / 10,
                      lon: Math.round(pos.coords.longitude * 10) / 10,
                      consent: true,
                      epoch: room.epoch,
                    });
                    await refresh();
                    tell("Примерное местоположение обновлено.");
                  })
                }
              >
                <MapPin size={17} />
                {s.locationShared
                  ? "Обновить местоположение"
                  : "Разрешить и поделиться"}
              </button>
              {s.locationShared && (
                <button
                  className="button secondary full"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await api("location", { clear: true, epoch: room.epoch });
                      await refresh();
                      tell("Ваше местоположение удалено.");
                    })
                  }
                >
                  Прекратить доступ и удалить
                </button>
              )}
            </div>
          )}
          {modal === "admin" &&
            (preview || cloud ? (
              <div className="form-stack">
                <ShieldCheck size={38} />
                <p>
                  {cloud
                    ? "Аккаунты и комнаты уже защищены на сервере. Отдельную административную панель я подключу следующим этапом, без доступа к текстам личной переписки."
                    : "Админка доступна только владельцу в серверной версии. Публичная дизайн-бета не содержит настоящих аккаунтов, паролей и переписки."}
                </p>
                <button className="button" onClick={() => setModal("progress")}>
                  Посмотреть готовые функции
                </button>
              </div>
            ) : admin ? (
              <div className="admin-overview">
                <div className="admin-counts">
                  <span>
                    <b>{admin.users.length}</b> участников
                  </span>
                  <span>
                    <b>{admin.rooms.length}</b> комнат
                  </span>
                </div>
                {admin.rooms.map((r) => (
                  <section className="admin-room" key={r.id}>
                    <strong>
                      Комната · {new Date(r.created).toLocaleDateString("ru")}
                    </strong>
                    {admin.users
                      .filter((u) => u.room === r.id)
                      .map((u) => (
                        <p key={u.id}>
                          {u.name}
                          <span>
                            {u.owner === u.id ? "Создатель" : "Участник"}
                          </span>
                        </p>
                      ))}
                  </section>
                ))}
                {admin.users.some((u) => !u.room) && (
                  <section className="admin-room">
                    <strong>Без комнаты</strong>
                    {admin.users
                      .filter((u) => !u.room)
                      .map((u) => (
                        <p key={u.id}>
                          {u.name}
                          <span>{u.email}</span>
                        </p>
                      ))}
                  </section>
                )}
                <p className="local-note">
                  Личные сообщения, записи и пароли комнат здесь не
                  показываются.
                </p>
                <button
                  className="button secondary full"
                  onClick={() =>
                    void act(async () => {
                      await api("admin/logout", {});
                      setAdmin(null);
                    })
                  }
                >
                  Выйти из админки
                </button>
              </div>
            ) : (
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void act(async () => {
                    const password = data.get("password");
                    if (setupToken) {
                      await api("admin/setup", { token: setupToken, password });
                      setSetupToken("");
                    }
                    await api("admin/login", { password });
                    setAdmin(await api("admin"));
                  });
                }}
              >
                <p className="muted">
                  {setupToken
                    ? "Одноразовая настройка владельца. Придумайте отдельный пароль от 14 символов."
                    : "Доступ только владельцу LoveLoom. Пароли комнат здесь не подходят."}
                </p>
                <label>
                  Пароль администратора
                  <input
                    name="password"
                    type="password"
                    minLength={setupToken ? 14 : 1}
                    maxLength={128}
                    required
                    autoComplete={
                      setupToken ? "new-password" : "current-password"
                    }
                  />
                </label>
                <button className="button full" disabled={busy}>
                  <ShieldCheck size={18} />
                  {setupToken
                    ? "Создать доступ владельца"
                    : "Войти как администратор"}
                </button>
                <p className="local-note">
                  Первичная настройка возможна только по защищённой ссылке,
                  созданной владельцем на локальном сервере.
                </p>
              </form>
            ))}
          {toast && (
            <p className="dialog-feedback" role="status">
              <Info size={17} />
              {toast}
            </p>
          )}
        </Dialog>
      )}
      {toast && !modal && (
        <div className="toast" role="status">
          <Info size={19} />
          <span>{toast}</span>
          <button aria-label="Закрыть уведомление" onClick={() => setToast("")}>
            <X size={17} />
          </button>
        </div>
      )}
    </>
  );
}
function CalendarMini({
  events,
  today: current,
  onSelect,
}: {
  events: Entry[];
  today: string;
  onSelect: (e: Entry) => void;
}) {
  const [month, setMonth] = useState(() => current.slice(0, 7));
  const [year, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, m, 0)).getUTCDate();
  function move(n: number) {
    const d = new Date(Date.UTC(year, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  }
  return (
    <section className="card calendar-card">
      <header>
        <h2>
          {new Intl.DateTimeFormat("ru", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(first)}
        </h2>
        <div className="row">
          <button
            className="icon-button"
            onClick={() => move(-1)}
            aria-label="Предыдущий месяц"
          >
            <ChevronLeft size={19} />
          </button>
          <button
            className="text-button"
            onClick={() => setMonth(current.slice(0, 7))}
          >
            Сегодня
          </button>
          <button
            className="icon-button"
            onClick={() => move(1)}
            aria-label="Следующий месяц"
          >
            <ChevronRight size={19} />
          </button>
        </div>
      </header>
      <div className="calendar-grid">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
          <span className="weekday" key={d}>
            {d}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={"blank" + i} />
        ))}
        {Array.from({ length }, (_, i) => {
          const day = month + "-" + String(i + 1).padStart(2, "0"),
            items = events.filter((e) => e.date === day);
          return (
            <div
              key={day}
              className={`calendar-day ${day === current ? "today" : ""}`}
            >
              <span>{i + 1}</span>
              {items.map((e) => (
                <button key={e.id} title={e.title} onClick={() => onSelect(e)}>
                  {e.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
