"use client";

import Image from "next/image";
import {
  Check,
  Dices,
  Heart,
  Plus,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { asset } from "@/lib/assets";
import {
  wheelLabelAngle,
  wheelRotationForWinner,
  wheelWinnerIndex,
} from "@/lib/wheel";

const wheelColors = [
  "#d66a83",
  "#e99b8d",
  "#8fae9a",
  "#b3a3d3",
  "#e2bb69",
  "#76a8bb",
  "#c786a8",
  "#98b873",
];

export default function DecisionWheel({
  tell,
}: {
  tell: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [wheelOptions, setWheelOptions] = useState([
    "Кино",
    "Прогулка",
    "Кафе",
    "Домашний вечер",
  ]);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [wheelResult, setWheelResult] = useState<string | null>(null);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRoot = useRef<HTMLDivElement>(null);
  const stageClose = useRef<HTMLButtonElement>(null);
  const winnerScreen = useRef<HTMLDivElement>(null);

  const cleanOptions = useMemo(
    () => wheelOptions.map((option) => option.trim()).filter(Boolean),
    [wheelOptions],
  );
  const wheelBackground = useMemo(() => {
    const count = Math.max(cleanOptions.length, 1);
    return `conic-gradient(${Array.from({ length: count }, (_, index) => {
      const start = (index / count) * 100;
      const end = ((index + 1) / count) * 100;
      return `${wheelColors[index]} ${start}% ${end}%`;
    }).join(",")})`;
  }, [cleanOptions.length]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => stageClose.current?.focus());
    const close = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const scope = winnerScreen.current || stageRoot.current;
        const focusable = Array.from(
          scope?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ) || [],
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (
          first &&
          last &&
          ((event.shiftKey &&
            (document.activeElement === first || document.activeElement === scope)) ||
            (!event.shiftKey && document.activeElement === last))
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
      if (event.key === "Escape" && !wheelSpinning) {
        setWheelResult(null);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [open, wheelSpinning]);

  useEffect(() => {
    if (!wheelResult) return;
    const frame = requestAnimationFrame(() => winnerScreen.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [wheelResult]);

  useEffect(
    () => () => {
      if (resultTimer.current) clearTimeout(resultTimer.current);
    },
    [],
  );

  function updateWheelOption(index: number, value: string) {
    setWheelOptions((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? value.slice(0, 48) : item,
      ),
    );
  }

  function removeWheelOption(index: number) {
    if (wheelOptions.length <= 2) {
      tell("Для колеса нужны хотя бы два варианта.");
      return;
    }
    setWheelOptions((items) =>
      items.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  function spinWheel() {
    if (wheelSpinning) return;
    if (cleanOptions.length < 2) {
      tell("Заполните хотя бы два варианта.");
      return;
    }
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    const selectedIndex = random % cleanOptions.length;
    const nextRotation = wheelRotationForWinner(
      wheelRotation,
      selectedIndex,
      cleanOptions.length,
    );
    setWheelResult(null);
    setWheelSpinning(true);
    setWheelRotation(nextRotation);
    if (resultTimer.current) clearTimeout(resultTimer.current);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 80
      : 3900;
    resultTimer.current = setTimeout(() => {
      const winnerIndex = wheelWinnerIndex(nextRotation, cleanOptions.length);
      setWheelSpinning(false);
      setWheelResult(cleanOptions[winnerIndex]);
    }, delay);
  }

  return (
    <>
      <button
        className="game-card game-wheel decision-wheel-card"
        onClick={() => {
          setWheelResult(null);
          setOpen(true);
        }}
      >
        <div className="card-label">
          <Dices size={28} strokeWidth={1.5} />
          <span>05</span>
        </div>
        <h2>Колесо решений</h2>
        <p>Запишите варианты и доверьте выбор удаче</p>
        <span className="game-detail-pill">До 8 своих вариантов</span>
        <span className="game-start">
          Запустить колесо
          <RotateCw size={20} />
        </span>
      </button>

      {open && (
        <div
          ref={stageRoot}
          className="game-stage wheel-stage"
          role="dialog"
          aria-modal="true"
          aria-label="Колесо решений"
        >
          <div className="game-stage-paper wheel-paper">
            <header className="game-stage-head">
              <button
                ref={stageClose}
                className="game-stage-close"
                onClick={() => {
                  setWheelResult(null);
                  setOpen(false);
                }}
                disabled={wheelSpinning}
                aria-label="Закрыть колесо"
              >
                <X size={21} />
              </button>
              <div>
                <span className="eyebrow">ДОВЕРЬТЕСЬ СЛУЧАЮ</span>
                <h2>Колесо решений</h2>
              </div>
              <span className="wheel-count">{cleanOptions.length} / 8</span>
            </header>
            <main className="wheel-layout">
              <section className="wheel-editor">
                <p>
                  Добавьте от двух до восьми вариантов. Пустые строки в колесо
                  не попадут.
                </p>
                <div className="wheel-option-list">
                  {wheelOptions.map((option, index) => (
                    <label key={index}>
                      <span>{index + 1}</span>
                      <input
                        value={option}
                        maxLength={48}
                        disabled={wheelSpinning}
                        onChange={(event) =>
                          updateWheelOption(index, event.target.value)
                        }
                        aria-label={`Вариант ${index + 1}`}
                        placeholder="Ваш вариант"
                      />
                      <button
                        type="button"
                        disabled={wheelSpinning || wheelOptions.length <= 2}
                        onClick={() => removeWheelOption(index)}
                        aria-label={`Удалить вариант ${index + 1}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="button secondary wheel-add"
                  disabled={wheelSpinning || wheelOptions.length >= 8}
                  onClick={() => setWheelOptions((items) => [...items, ""])}
                >
                  <Plus size={17} />
                  Добавить вариант
                </button>
              </section>
              <section className="wheel-play-area">
                <div className="wheel-pointer" aria-hidden="true" />
                <div
                  className={`fortune-wheel ${wheelSpinning ? "is-spinning" : ""}`}
                  style={{
                    background: wheelBackground,
                    transform: `rotate(${wheelRotation}deg)`,
                  }}
                  aria-label={`Колесо с вариантами: ${cleanOptions.join(", ")}`}
                >
                  {cleanOptions.map((option, index) => {
                    const angle = wheelLabelAngle(index, cleanOptions.length);
                    return (
                      <span
                        key={`${option}-${index}`}
                        style={{ "--wheel-angle": `${angle}deg` } as CSSProperties}
                      >
                        <b>{option}</b>
                      </span>
                    );
                  })}
                  <i className="wheel-center">
                    <Image
                      src={asset("/loveloom-mark.png")}
                      width={68}
                      height={68}
                      alt="Логотип LoveLoom"
                    />
                  </i>
                </div>
                <button
                  className="button wheel-spin"
                  disabled={wheelSpinning}
                  onClick={spinWheel}
                >
                  {wheelSpinning ? "Колесо выбирает…" : "Крутить колесо"}
                  <RotateCw size={18} />
                </button>
              </section>
            </main>
          </div>

          {wheelResult && (
            <div
              ref={winnerScreen}
              className="wheel-result-screen"
              role="status"
              aria-live="assertive"
              tabIndex={-1}
            >
              <div className="confetti-field" aria-hidden="true">
                {Array.from({ length: 36 }, (_, index) => (
                  <i
                    key={index}
                    style={
                      {
                        "--confetti-x": `${(index * 37) % 100}vw`,
                        "--confetti-delay": `${(index % 9) * 0.07}s`,
                        "--confetti-color": wheelColors[index % wheelColors.length],
                        "--confetti-turn": `${120 + (index % 6) * 70}deg`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
              <span>КОЛЕСО ВЫБРАЛО</span>
              <Heart className="winner-heart" size={38} fill="currentColor" />
              <strong>{wheelResult}</strong>
              <div>
                <button
                  className="button secondary"
                  onClick={() => setWheelResult(null)}
                >
                  Вернуться к колесу
                </button>
                <button
                  className="button"
                  onClick={() => {
                    setWheelResult(null);
                    setOpen(false);
                  }}
                >
                  Отличный выбор
                  <Check size={17} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
