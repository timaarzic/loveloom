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
  type CSSProperties,
  type FormEvent,
} from "react";
import { openCloudTouch, type TouchConnection } from "@/lib/cloud";
import { asset } from "@/lib/assets";
import { gardenProgress } from "@/lib/garden";
import DecisionWheel from "@/components/decision-wheel";
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

type BloomParticle = {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  rotation: number;
  color: string;
};

type TactileBloom = {
  id: number;
  particles: BloomParticle[];
  screenParticles: Array<{
    id: number;
    kind: "heart" | "kiss";
    x: number;
    y: number;
    size: number;
    delay: number;
    duration: number;
    rotation: number;
    driftX: number;
    driftY: number;
    color: string;
  }>;
};

const bloomColors = ["#f4a9bd", "#edbfd0", "#e88ca8", "#f6cfda", "#d97899"];
const gardenTitles = [
  "Первый росток",
  "Сад просыпается",
  "Цветущий уголок",
  "Большой сад для двоих",
];

function makeTactileBloom(): TactileBloom {
  return {
    id: Date.now(),
    particles: Array.from({ length: 20 }, (_, id) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 74 + Math.random() * 112;
      return {
        id,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        size: 8 + Math.random() * 17,
        delay: Math.random() * 210,
        duration: 1250 + Math.random() * 850,
        rotation: -120 + Math.random() * 240,
        color: bloomColors[Math.floor(Math.random() * bloomColors.length)],
      };
    }),
    screenParticles: Array.from({ length: 18 }, (_, id) => ({
      id,
      kind: Math.random() > 0.42 ? "heart" : "kiss",
      x: 7 + Math.random() * 86,
      y: 9 + Math.random() * 78,
      size: 20 + Math.random() * 30,
      delay: Math.random() * 520,
      duration: 720 + Math.random() * 650,
      rotation: -34 + Math.random() * 68,
      driftX: -38 + Math.random() * 76,
      driftY: -62 - Math.random() * 54,
      color: bloomColors[Math.floor(Math.random() * bloomColors.length)],
    })),
  };
}

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

function AudioBubble({ media }: { media: MediaItem }) {
  const [playableUrl, setPlayableUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!media.url) return;
    let active = true;
    let objectUrl = "";
    setPlayableUrl("");
    setFailed(false);
    void fetch(media.url)
      .then((response) => {
        if (!response.ok) throw new Error("voice download failed");
        return response.blob();
      })
      .then((blob) => {
        if (blob.size < 1_000) throw new Error("empty voice message");
        objectUrl = URL.createObjectURL(
          blob.type === media.mime ? blob : new Blob([blob], { type: media.mime }),
        );
        if (active) setPlayableUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [media.mime, media.url]);

  if (failed)
    return (
      <span className="media-unavailable">
        <Cloud size={18} /> Эта старая запись повреждена или временно недоступна
      </span>
    );
  if (!playableUrl)
    return (
      <span className="voice-loading">
        <LoaderCircle className="spin" size={17} /> Готовим голосовое…
      </span>
    );
  return (
    <audio
      controls
      preload="metadata"
      src={playableUrl}
      onError={() => setFailed(true)}
    />
  );
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
        <AudioBubble media={media} />
      )}
      {media.caption && <p className="media-caption">{media.caption}</p>}
    </div>
  );
}

function AlbumPhoto({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);
  const visible = Boolean(item.url) && !failed;
  return (
    <a
      href={item.url || undefined}
      target="_blank"
      rel="noreferrer"
      className="album-photo"
      aria-label={visible ? "Открыть фотографию" : "Оригинал временно недоступен"}
      onClick={(event) => {
        if (!item.url) event.preventDefault();
      }}
    >
      {visible ? (
        <Image
          src={item.url!}
          alt={item.caption || "Фотография в общем альбоме"}
          fill
          sizes="(max-width: 720px) 31vw, 180px"
          loading="lazy"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="album-photo-fallback">
          <ImagePlus size={25} />
          <small>Открыть оригинал</small>
        </span>
      )}
      <span className="album-size">{formatBytes(item.bytes)}</span>
    </a>
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
  const [uploadError, setUploadError] = useState("");
  const [touchStatus, setTouchStatus] = useState<
    "connecting" | "ready" | "error"
  >("connecting");
  const [touchCount, setTouchCount] = useState(0);
  const [bloom, setBloom] = useState<TactileBloom | null>(null);
  const [sentPulse, setSentPulse] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const touchRef = useRef<TouchConnection | null>(null);
  const bloomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerBloom = useCallback(() => {
    setBloom(makeTactileBloom());
    setSentPulse(true);
    if (bloomTimer.current) clearTimeout(bloomTimer.current);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    bloomTimer.current = setTimeout(() => setBloom(null), 2400);
    pulseTimer.current = setTimeout(() => setSentPulse(false), 900);
  }, []);

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
        triggerBloom();
        if ("vibrate" in navigator) navigator.vibrate([90, 45, 120]);
      },
      onPresence: setTouchCount,
      onStatus: setTouchStatus,
    });
    return () => {
      touchRef.current?.close();
      touchRef.current = null;
      if (bloomTimer.current) clearTimeout(bloomTimer.current);
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, [cloud, room.id, triggerBloom, user.id]);

  async function uploadAlbum(files: FileList | null) {
    if (!files?.length || working) return;
    if (!cloud) {
      tell("Фотоальбом доступен в облачной beta-версии.");
      return;
    }
    const selected = Array.from(files).slice(0, 12);
    setUploadError("");
    setWorking(true);
    try {
      let uploaded = 0;
      const failures: string[] = [];
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        setUploadStatus(`Загружаем ${index + 1} из ${selected.length}`);
        try {
          await api("media", {
            file,
            context: "album",
            roomId: room.id,
            authorId: user.id,
            epoch: room.epoch,
          });
          uploaded += 1;
        } catch (error) {
          failures.push(
            `${file.name || "Фото"}: ${
              error instanceof Error ? error.message : "не удалось загрузить"
            }`,
          );
        }
      }
      if (uploaded) await load();
      if (failures.length) {
        const message = failures[0];
        setUploadError(message);
        tell(uploaded ? `Загружено ${uploaded}; часть файлов не добавилась.` : message);
      } else {
        tell(uploaded === 1 ? "Фото добавлено в альбом." : "Фотографии добавлены в альбом.");
      }
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
    triggerBloom();
    tell("Сигнал отправлен.");
  }

  const minDate = new Date(Date.now() + 2 * 60000);
  minDate.setMinutes(minDate.getMinutes() - minDate.getTimezoneOffset());
  const minCapsuleDate = minDate.toISOString().slice(0, 16);
  const partnerHere = hasPartner && touchCount >= 2 && touchStatus === "ready";
  const gardenGrowth = gardenProgress(garden.growth);
  const gardenStage = gardenGrowth.stage;

  return (
    <>
      {bloom && (
        <span className="tactile-screen-bloom" key={`screen-${bloom.id}`} aria-hidden="true">
          {bloom.screenParticles.map((particle) => (
            <span
              className={`screen-love screen-love-${particle.kind}`}
              key={particle.id}
              style={
                {
                  "--screen-x": `${particle.x}%`,
                  "--screen-y": `${particle.y}%`,
                  "--screen-size": `${particle.size}px`,
                  "--screen-delay": `${particle.delay}ms`,
                  "--screen-duration": `${particle.duration}ms`,
                  "--screen-rotation": `${particle.rotation}deg`,
                  "--screen-drift-x": `${particle.driftX}px`,
                  "--screen-drift-y": `${particle.driftY}px`,
                  "--screen-color": particle.color,
                } as CSSProperties
              }
            >
              {particle.kind === "heart" ? (
                <Heart fill="currentColor" strokeWidth={1.35} />
              ) : (
                <svg viewBox="0 0 48 32" role="presentation">
                  <path d="M2 16C10 10 14 5 23 11C32 5 37 10 46 16C38 27 11 27 2 16Z" />
                  <path d="M4 16C14 15 18 17 24 16C30 17 35 15 44 16" />
                </svg>
              )}
            </span>
          ))}
        </span>
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
          <div className="tactile-heart-wrap">
            {bloom && (
              <span className="tactile-bloom" key={bloom.id} aria-hidden="true">
                <span className="tactile-wave wave-one" />
                <span className="tactile-wave wave-two" />
                {bloom.particles.map((particle) => (
                  <i
                    key={particle.id}
                    style={
                      {
                        "--bloom-x": `${particle.x}px`,
                        "--bloom-y": `${particle.y}px`,
                        "--bloom-size": `${particle.size}px`,
                        "--bloom-delay": `${particle.delay}ms`,
                        "--bloom-duration": `${particle.duration}ms`,
                        "--bloom-rotation": `${particle.rotation}deg`,
                        "--bloom-color": particle.color,
                      } as CSSProperties
                    }
                  />
                ))}
              </span>
            )}
            <button
              className={`tactile-heart ${sentPulse ? "is-sent" : ""}`}
              onClick={() => void sendHeart()}
              disabled={!cloud || touchStatus !== "ready"}
              aria-label="Отправить тактильное сердце"
            >
              <Image
                className="tactile-logo"
                src={asset("/loveloom-mark.png")}
                width={150}
                height={150}
                alt=""
                aria-hidden="true"
              />
            </button>
          </div>
          <span className="tactile-action">
            {partnerHere ? "Нажмите на сердце" : "Нужно открыть раздел вдвоём"}
          </span>
          <div className="privacy-note compact">
            <LockKeyhole size={15} /> Сигнал не сохраняется и работает только пока раздел открыт.
          </div>
        </section>

        <section className="card garden-card">
          <div className="card-label">
            <span><Sprout size={19} /> Виртуальный сад</span>
            <span>{garden.growth} забот</span>
          </div>
          <div className={`garden-visual stage-${gardenStage}`} aria-label={`Стадия сада ${gardenStage + 1} из 4`}>
            <span className="garden-sun" />
            <span className="garden-ground" />
            <Sprout className="plant plant-one" />
            {gardenStage >= 1 && (
              <>
                <Sprout className="plant plant-two" />
                <Flower2 className="plant flower-one" />
              </>
            )}
            {gardenStage >= 2 && (
              <>
                <span className="garden-bush bush-one" />
                <span className="garden-bush bush-two" />
                <Flower2 className="plant flower-two" />
              </>
            )}
            {gardenStage >= 3 && (
              <>
                <span className="garden-tree" aria-hidden="true">
                  <span className="garden-tree-trunk" />
                  <span className="garden-tree-crown" />
                </span>
                <Flower2 className="plant flower-three" />
                <Sparkles className="garden-sparkles" />
              </>
            )}
          </div>
          <h3>{gardenTitles[gardenStage]}</h3>
          <div className="garden-milestone" aria-label="Прогресс роста сада">
            <span>
              {gardenGrowth.next
                ? `До следующего роста: ${gardenGrowth.remaining}`
                : "Сад достиг самой пышной стадии"}
            </span>
            <span className="garden-progress-track" aria-hidden="true">
              <i style={{ width: `${gardenGrowth.percent}%` }} />
            </span>
          </div>
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
            accept="image/*,.heic,.heif"
            multiple
            aria-label="Выбрать фотографии для общего альбома"
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
          {uploadError && <p className="album-upload-error" role="alert">{uploadError}</p>}
          {loading ? (
            <div className="feature-loader"><LoaderCircle className="spin" /></div>
          ) : album.length ? (
            <div className="album-grid">
              {album.map((item) => <AlbumPhoto item={item} key={item.id} />)}
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
          <p className="capsule-limit-note">Хранятся три последние капсулы. Новая автоматически заменяет самую старую.</p>
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
        <DecisionWheel tell={tell} />
      </div>
      <div className="moments-divider">
        <span><Send size={15} /> Ниже остаются ваши мини-игры</span>
      </div>
    </>
  );
}
