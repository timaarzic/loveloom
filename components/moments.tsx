"use client";

import Image from "next/image";
import {
  Camera,
  Check,
  Cloud,
  Droplets,
  Flower2,
  Heart,
  Hourglass,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  Send,
  Sparkles,
  Sprout,
  Unlock,
  UploadCloud,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { openCloudTouch, type TouchConnection } from "@/lib/cloud";
import type {
  GardenState,
  MediaItem,
  Room,
  TimeCapsule,
  User,
} from "@/lib/types";

type Api = (path: string, body?: unknown, method?: string) => Promise<any>;

const emptyGarden: GardenState = {
  growth: 0,
  stage: 0,
  wateredToday: false,
  lastWateredBy: null,
  lastWateredAt: null,
};

function formatMoment(value: number, timezone: string) {
  return new Intl.DateTimeFormat("ru", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} МБ`;
}

export function MediaBubble({ media }: { media: MediaItem }) {
  if (!media.url)
    return (
      <span className="media-unavailable">
        <Cloud size={19} /> Файл временно недоступен
      </span>
    );
  return (
    <div className={`message-media media-${media.kind}`}>
      {media.kind === "image" && (
        <a href={media.url} target="_blank" rel="noreferrer">
          <span className="message-image-frame">
            <Image
              src={media.url}
              alt={media.caption || "Фотография в чате"}
              fill
              sizes="(max-width: 720px) 78vw, 420px"
              loading="lazy"
              unoptimized
            />
          </span>
        </a>
      )}
      {media.kind === "video" && (
        <video controls preload="metadata" playsInline>
          <source src={media.url} type={media.mime} />
        </video>
      )}
      {media.kind === "audio" && (
        <audio controls preload="metadata">
          <source src={media.url} type={media.mime} />
        </audio>
      )}
      {media.caption && <p className="media-caption">{media.caption}</p>}
    </div>
  );
}

export default function MomentsHub({
  api,
  room,
  user,
  partnerName,
  hasPartner,
  cloud,
  tell,
}: {
  api: Api;
  room: Room;
  user: User;
  partnerName: string;
  hasPartner: boolean;
  cloud: boolean;
  tell: (message: string) => void;
}) {
  const [album, setAlbum] = useState<MediaItem[]>([]);
  const [capsules, setCapsules] = useState<TimeCapsule[]>([]);
  const [garden, setGarden] = useState<GardenState>(emptyGarden);
  const [loading, setLoading] = useState(cloud);
  const [working, setWorking] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [touchStatus, setTouchStatus] = useState<
    "connecting" | "ready" | "error"
  >("connecting");
  const [touchCount, setTouchCount] = useState(0);
  const [bloom, setBloom] = useState(0);
  const [sentPulse, setSentPulse] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const touchRef = useRef<TouchConnection | null>(null);
  const bloomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!cloud) {
      setLoading(false);
      return;
    }
    try {
      const [mediaResult, capsuleResult, gardenResult] = await Promise.all([
        api("media?context=album"),
        api("capsules"),
        api("garden"),
      ]);
      setAlbum(mediaResult.items || []);
      setCapsules(capsuleResult.capsules || []);
      setGarden(gardenResult.garden || emptyGarden);
    } catch (error) {
      tell(error instanceof Error ? error.message : "Не удалось обновить раздел.");
    } finally {
      setLoading(false);
    }
  }, [api, cloud, tell]);

  useEffect(() => {
    void load();
    if (!cloud) return;
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [cloud, load]);

  useEffect(() => {
    if (!cloud) return;
    touchRef.current = openCloudTouch(room.id, user.id, {
      onHeart: () => {
        setBloom((value) => value + 1);
        if (bloomTimer.current) clearTimeout(bloomTimer.current);
        bloomTimer.current = setTimeout(() => setBloom(0), 2600);
        if ("vibrate" in navigator) navigator.vibrate([90, 45, 120]);
      },
      onPresence: setTouchCount,
      onStatus: setTouchStatus,
    });
    return () => {
      touchRef.current?.close();
      touchRef.current = null;
      if (bloomTimer.current) clearTimeout(bloomTimer.current);
    };
  }, [cloud, room.id, user.id]);

  async function uploadAlbum(files: FileList | null) {
    if (!files?.length || working) return;
    if (!cloud) {
      tell("Фотоальбом доступен в облачной beta-версии.");
      return;
    }
    const selected = Array.from(files).slice(0, 12);
    setWorking(true);
    try {
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        setUploadStatus(`Загружаем ${index + 1} из ${selected.length}`);
        await api("media", {
          file,
          context: "album",
          roomId: room.id,
          authorId: user.id,
          epoch: room.epoch,
        });
      }
      tell(selected.length === 1 ? "Фото добавлено в альбом." : "Фотографии добавлены в альбом.");
      await load();
    } catch (error) {
      tell(error instanceof Error ? error.message : "Не удалось загрузить фото.");
    } finally {
      setWorking(false);
      setUploadStatus("");
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function createCapsule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    if (!cloud) {
      tell("Капсулы времени доступны в облачной beta-версии.");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const localTime = String(data.get("opensAt") || "");
    const opensAt = new Date(localTime);
    if (!localTime || Number.isNaN(opensAt.getTime())) {
      tell("Выберите дату и время открытия.");
      return;
    }
    setWorking(true);
    try {
      await api("capsules", {
        epoch: room.epoch,
        title: data.get("title"),
        body: data.get("body"),
        opensAt: opensAt.toISOString(),
      });
      form.reset();
      tell("Капсула закрыта до выбранного времени.");
      await load();
    } catch (error) {
      tell(error instanceof Error ? error.message : "Не удалось создать капсулу.");
    } finally {
      setWorking(false);
    }
  }

  async function waterGarden() {
    if (working) return;
    if (!cloud) {
      tell("Виртуальный сад доступен в облачной beta-версии.");
      return;
    }
    setWorking(true);
    try {
      await api("garden", { epoch: room.epoch });
      tell("Сад получил ещё немного заботы.");
      await load();
    } catch (error) {
      tell(error instanceof Error ? error.message : "Не удалось полить сад.");
    } finally {
      setWorking(false);
    }
  }

  async function sendHeart() {
    if (!hasPartner || touchCount < 2) {
      tell(`${partnerName} должен открыть раздел «Для двоих» одновременно с вами.`);
      return;
    }
    const sent = await touchRef.current?.sendHeart();
    if (!sent) {
      tell("Сигнал не отправился. Проверьте соединение.");
      return;
    }
    setSentPulse(true);
    window.setTimeout(() => setSentPulse(false), 900);
    tell("Сигнал отправлен.");
  }

  const minDate = new Date(Date.now() + 2 * 60000);
  minDate.setMinutes(minDate.getMinutes() - minDate.getTimezoneOffset());
  const minCapsuleDate = minDate.toISOString().slice(0, 16);
  const partnerHere = hasPartner && touchCount >= 2 && touchStatus === "ready";

  return (
    <>
      {bloom > 0 && (
        <div className="tactile-bloom" key={bloom} aria-hidden="true">
          <span><Heart fill="currentColor" /></span>
          <i /><i /><i />
        </div>
      )}
      <div className="moments-intro">
        <div>
          <div className="eyebrow">МАЛЕНЬКИЕ РИТУАЛЫ ДЛЯ ДВОИХ</div>
          <h1>Чуть ближе. <em>Даже через экран.</em></h1>
          <p>Фото, капсулы, общий сад и короткий тактильный сигнал.</p>
        </div>
        <Sparkles className="page-illustration" size={70} strokeWidth={1.2} />
      </div>

      {!cloud && (
        <div className="inline-notice feature-notice">
          <Cloud size={20} />
          <span>Новые общие функции включаются в облачной beta. Локальный режим их не сохраняет.</span>
        </div>
      )}

      <div className="moments-grid">
        <section className="card tactile-card">
          <div className="card-label">
            <span><Heart size={19} /> Тактильность</span>
            <span className={`live-pill ${partnerHere ? "is-live" : ""}`}>
              {touchStatus === "error"
                ? "нет связи"
                : partnerHere
                  ? "вы оба здесь"
                  : "ждём двоих"}
            </span>
          </div>
          <p>
            Откройте этот раздел одновременно. Нажатие мягко оживит экран партнёра и включит вибрацию, если устройство её поддерживает.
          </p>
          <button
            className={`tactile-heart ${sentPulse ? "is-sent" : ""}`}
            onClick={() => void sendHeart()}
            disabled={!cloud || touchStatus !== "ready"}
            aria-label="Отправить тактильное сердце"
          >
            <span className="heart-rings" />
            <Heart size={55} fill="currentColor" strokeWidth={1.3} />
            <small>{partnerHere ? "коснуться" : "нужно быть здесь вдвоём"}</small>
          </button>
          <div className="privacy-note compact">
            <LockKeyhole size={15} /> Сигнал не сохраняется и работает только пока раздел открыт.
          </div>
        </section>

        <section className="card garden-card">
          <div className="card-label">
            <span><Sprout size={19} /> Виртуальный сад</span>
            <span>{garden.growth} забот</span>
          </div>
          <div className={`garden-visual stage-${garden.stage}`} aria-label={`Стадия сада ${garden.stage + 1} из 6`}>
            <span className="garden-ground" />
            <Sprout className="plant plant-one" />
            {garden.stage >= 1 && <Sprout className="plant plant-two" />}
            {garden.stage >= 2 && <Flower2 className="plant flower-one" />}
            {garden.stage >= 3 && <Flower2 className="plant flower-two" />}
            {garden.stage >= 4 && <Flower2 className="plant flower-three" />}
            {garden.stage >= 5 && <Sparkles className="garden-sparkles" />}
          </div>
          <h3>{garden.stage < 2 ? "Ваш сад начинает расти" : garden.stage < 5 ? "Здесь становится уютнее" : "Сад расцвёл"}</h3>
          <p>Каждый участник может полить сад один раз в день по времени комнаты.</p>
          <button
            className="button secondary full garden-water"
            disabled={working || garden.wateredToday || !cloud}
            onClick={() => void waterGarden()}
          >
            {garden.wateredToday ? <Check size={18} /> : <Droplets size={18} />}
            {garden.wateredToday ? "Сегодня уже полито" : "Полить сад"}
          </button>
        </section>

        <section className="card album-card">
          <div className="card-label">
            <span><Camera size={19} /> Общий фотоальбом</span>
            <span>{album.length} фото</span>
          </div>
          <p>Оригиналы остаются в закрытом облаке и загружаются на устройство только для просмотра.</p>
          <input
            ref={uploadRef}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            multiple
            onChange={(event) => void uploadAlbum(event.target.files)}
          />
          <button
            className="button album-upload"
            disabled={working || !cloud}
            onClick={() => uploadRef.current?.click()}
          >
            {working && uploadStatus ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <ImagePlus size={18} />
            )}
            {uploadStatus || "Добавить фотографии"}
          </button>
          {loading ? (
            <div className="feature-loader"><LoaderCircle className="spin" /></div>
          ) : album.length ? (
            <div className="album-grid">
              {album.map((item) => (
                <a
                  key={item.id}
                  href={item.url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="album-photo"
                  aria-disabled={!item.url}
                >
                  {item.url && (
                    <Image
                      src={item.url}
                      alt={item.caption || "Фотография в общем альбоме"}
                      fill
                      sizes="(max-width: 720px) 31vw, 180px"
                      loading="lazy"
                      unoptimized
                    />
                  )}
                  <span>{formatBytes(item.bytes)}</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="album-empty">
              <UploadCloud size={30} />
              <span>Первая фотография начнёт ваш общий альбом.</span>
            </div>
          )}
        </section>

        <section className="card capsule-card">
          <div className="card-label">
            <span><Hourglass size={19} /> Капсула времени</span>
            <span>{capsules.length} капсул</span>
          </div>
          <form className="capsule-form" onSubmit={createCapsule}>
            <label>
              Название
              <input name="title" maxLength={100} placeholder="Открыть в особенный день" required />
            </label>
            <label>
              Послание
              <textarea name="body" maxLength={8000} rows={3} placeholder="Текст будет скрыт до выбранного времени" required />
            </label>
            <label>
              Когда открыть
              <input name="opensAt" type="datetime-local" min={minCapsuleDate} required />
            </label>
            <button className="button full" disabled={working || !cloud}>
              <LockKeyhole size={17} /> Закрыть капсулу
            </button>
          </form>
          <div className="capsule-list">
            {capsules.map((capsule) => (
              <article className={`capsule-item ${capsule.isOpen ? "is-open" : ""}`} key={capsule.id}>
                <span className="capsule-icon">
                  {capsule.isOpen ? <Unlock size={18} /> : <LockKeyhole size={18} />}
                </span>
                <div>
                  <strong>{capsule.title}</strong>
                  <small>
                    {capsule.isOpen ? "Открыта" : "Откроется"} {formatMoment(capsule.opensAt, room.timezone)}
                  </small>
                  {capsule.isOpen && capsule.body && <p>{capsule.body}</p>}
                </div>
              </article>
            ))}
            {!loading && capsules.length === 0 && (
              <p className="capsule-empty">Пока нет капсул. Создайте первую и выберите время открытия.</p>
            )}
          </div>
        </section>
      </div>
      <div className="moments-divider">
        <span><Send size={15} /> Ниже остаются ваши мини-игры</span>
      </div>
    </>
  );
}
