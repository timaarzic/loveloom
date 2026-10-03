"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Gamepad2,
  Heart,
  LockKeyhole,
  RotateCw,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import type { Game, Room, User } from "@/lib/types";

type Api = (path: string, body?: unknown, method?: string) => Promise<any>;
type Stage = "round" | null;

type Props = {
  api: Api;
  room: Room;
  user: User;
  partnerName: string;
  hasPartner: boolean;
  game: Game | null;
  setGame: (game: Game | null) => void;
  tell: (message: string) => void;
  onGameChange?: () => void;
};

const gameCards = [
  {
    id: "know",
    title: "Знаю тебя",
    subtitle: "Предугадайте выбор друг друга",
    detail: "20 тёплых вопросов",
    n: "01",
    icon: Heart,
  },
  {
    id: "quiz",
    title: "Сравним ответы",
    subtitle: "Небольшая викторина на двоих",
    detail: "20 вопросов с ответами",
    n: "02",
    icon: Sparkles,
  },
  {
    id: "either",
    title: "Одно из двух",
    subtitle: "Море или горы? Давайте узнаем",
    detail: "20 уютных выборов",
    n: "03",
    icon: Gamepad2,
  },
  {
    id: "date",
    title: "Что сделаем вместе?",
    subtitle: "Идея для вашего следующего дня",
    detail: "20 идей для свиданий",
    n: "04",
    icon: Sun,
  },
] as const;

function gameTitle(kind: Game["kind"]) {
  return gameCards.find((item) => item.id === kind)?.title || "Раунд для двоих";
}

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export default function GamesExperience({
  api,
  room,
  user,
  partnerName,
  hasPartner,
  game,
  setGame,
  tell,
  onGameChange,
}: Props) {
  const [stage, setStage] = useState<Stage>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [guess, setGuess] = useState("");
  const stageRoot = useRef<HTMLDivElement>(null);
  const stageClose = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setAnswer("");
    setGuess("");
  }, [game?.id]);

  useEffect(() => {
    if (!stage) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => stageClose.current?.focus());
    const close = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const scope = stageRoot.current;
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
      if (event.key === "Escape") setStage(null);
    };
    window.addEventListener("keydown", close);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [stage]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      tell(error instanceof Error ? error.message : "Не удалось открыть игру.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshGame() {
    const result = await api("games");
    setGame(result.game);
    return result.game as Game | null;
  }

  async function startRound(kind: Game["kind"]) {
    await run(async () => {
      const current = await refreshGame();
      if (current && !current.complete) {
        setStage("round");
        return;
      }
      await api("games", { kind, epoch: room.epoch });
      await refreshGame();
      onGameChange?.();
      setStage("round");
    });
  }

  async function submitAnswer(selected: string, predicted?: string) {
    if (!game) return;
    await run(async () => {
      await api("games", {
        action: "answer",
        id: game.id,
        answer: selected,
        guess: predicted,
        epoch: room.epoch,
      });
      await refreshGame();
      onGameChange?.();
    });
  }

  const myResponse = game?.responses.find((response) => response.user === user.id);

  return (
    <>
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
        <Gamepad2 className="page-illustration" size={75} strokeWidth={1} />
      </div>

      {game && !game.complete && (
        <button className="active-round-banner" onClick={() => setStage("round")}>
          <span className="active-round-pulse" />
          <span>
            <small>РАУНД УЖЕ ЖДЁТ</small>
            <strong>{gameTitle(game.kind)}</strong>
          </span>
          <span className="active-round-action">
            Открыть
            <ArrowRight size={18} />
          </span>
        </button>
      )}

      <div className="games-grid games-grid-v6">
        {gameCards.map((card) => (
          <button
            key={card.id}
            className={`game-card game-${card.id}`}
            disabled={busy || !hasPartner}
            onClick={() => void startRound(card.id)}
          >
            <div className="card-label">
              <card.icon size={28} strokeWidth={1.5} />
              <span>{card.n}</span>
            </div>
            <h2>{card.title}</h2>
            <p>{card.subtitle}</p>
            <span className="game-detail-pill">{card.detail}</span>
            <span className="game-start">
              {hasPartner ? "Открыть игру" : "Нужны два участника"}
              <ArrowRight size={20} />
            </span>
          </button>
        ))}
      </div>

      <div className="privacy-note">
        <LockKeyhole size={16} />
        Ответы открываются только после выбора обоих. В каждой игре — 20 разных вопросов.
      </div>

      {stage === "round" && game && (
        <div
          ref={stageRoot}
          className="game-stage"
          role="dialog"
          aria-modal="true"
          aria-label={gameTitle(game.kind)}
        >
          <div className="game-stage-paper">
            <header className="game-stage-head">
              <button
                ref={stageClose}
                className="game-stage-close"
                onClick={() => setStage(null)}
                aria-label="Закрыть игру"
              >
                <X size={21} />
              </button>
              <div>
                <span className="eyebrow">ИГРА ДЛЯ ДВОИХ · 20 ВОПРОСОВ</span>
                <h2>{gameTitle(game.kind)}</h2>
              </div>
              <span className={`round-status ${game.complete ? "is-complete" : ""}`}>
                {game.complete ? <CheckCircle2 size={15} /> : <Clock size={15} />}
                {game.complete ? "Готово" : "Раунд идёт"}
              </span>
            </header>

            <main className="game-stage-content">
              <div className="question-number">ваш вопрос</div>
              <h3>{game.question}</h3>

              {!myResponse ? (
                game.kind === "know" ? (
                  <div className="know-answer-flow">
                    <fieldset>
                      <legend>Что выберете вы?</legend>
                      <div className="stage-answer-grid">
                        {game.choices.map((choice) => (
                          <button
                            type="button"
                            key={choice}
                            className={answer === choice ? "is-selected" : ""}
                            onClick={() => setAnswer(choice)}
                          >
                            <span />
                            {choice}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>А что, по-вашему, выберет {partnerName}?</legend>
                      <div className="stage-answer-grid">
                        {game.choices.map((choice) => (
                          <button
                            type="button"
                            key={choice}
                            className={guess === choice ? "is-selected" : ""}
                            onClick={() => setGuess(choice)}
                          >
                            <span />
                            {choice}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <button
                      className="button game-submit"
                      disabled={busy || !answer || !guess}
                      onClick={() => void submitAnswer(answer, guess)}
                    >
                      Сохранить два ответа
                      <Check size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="stage-answer-grid stage-answer-main">
                    {game.choices.map((choice, index) => (
                      <button
                        type="button"
                        key={choice}
                        disabled={busy}
                        onClick={() => void submitAnswer(choice)}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        {choice}
                      </button>
                    ))}
                  </div>
                )
              ) : !game.complete ? (
                <div className="round-wait-stage">
                  <span className="waiting-heart"><Heart size={29} fill="currentColor" /></span>
                  <h4>Ваша ниточка уже здесь</h4>
                  <p>Ответ сохранён и скрыт. Откроем оба выбора, когда ответит {partnerName}.</p>
                </div>
              ) : (
                <div className="round-results">
                  {game.responses.map((response) => {
                    const mine = response.user === user.id;
                    const partnerAnswer = game.responses.find((item) => item.user !== response.user)?.answer;
                    return (
                      <article key={response.user}>
                        <span className="result-avatar">{initials(mine ? user.name : partnerName)}</span>
                        <div>
                          <small>{mine ? "ВАШ ВЫБОР" : partnerName.toUpperCase()}</small>
                          <strong>{response.answer}</strong>
                          {response.guess && (
                            <p className={response.guess === partnerAnswer ? "is-match" : ""}>
                              Прогноз: {response.guess}
                              <br />
                              {response.guess === partnerAnswer ? (
                                <>
                                  Вы почувствовали выбор друг друга
                                  <Heart
                                    className="result-match-heart"
                                    size={12}
                                    fill="currentColor"
                                  />
                                </>
                              ) : (
                                "Сегодня ниточки пошли разными маршрутами"
                              )}
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  {game.correctAnswer && (
                    <div className="quiz-answer-reveal">
                      <CheckCircle2 size={19} />
                      Правильный ответ: <strong>{game.correctAnswer}</strong>
                    </div>
                  )}
                  <button className="button" disabled={busy} onClick={() => void startRound(game.kind)}>
                    Ещё один вопрос
                    <RotateCw size={17} />
                  </button>
                </div>
              )}
            </main>
          </div>
        </div>
      )}

    </>
  );
}
