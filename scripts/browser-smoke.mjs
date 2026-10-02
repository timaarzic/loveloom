import { chromium, request } from "@playwright/test";
import bundledChromium from "@sparticuz/chromium";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { localChromium } from "./chromium-local.mjs";

// Test data is isolated from the app's .data directory. No real account data.
const data = mkdtempSync(join(tmpdir(), "loveloom-browser-"));
const output = resolve("test-results");
mkdirSync(output, { recursive: true });
const base = "http://127.0.0.1:3100";
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      LOVELOOM_LOCAL_ALPHA: "1",
      LOVELOOM_DATA_DIR: data,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
server.stdout.on("data", (chunk) => (logs += chunk));
server.stderr.on("data", (chunk) => (logs += chunk));
let browser;
let browserPartner;
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      const r = await fetch(base + "/api/state");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.ok(ready, logs);
  browser = await chromium.launch(
    process.platform === "linux"
      ? {
          ...localChromium(),
          args: bundledChromium.args.filter(
            (a) =>
              ![
                "--disable-web-security",
                "--allow-running-insecure-content",
              ].includes(a),
          ),
          headless: true,
        }
      : { headless: true },
  );
  browserPartner = await chromium.launch(
    process.platform === "linux"
      ? {
          ...localChromium(),
          args: bundledChromium.args.filter(
            (a) =>
              ![
                "--disable-web-security",
                "--allow-running-insecure-content",
              ].includes(a),
          ),
          headless: true,
        }
      : { headless: true },
  );
  const ctxA = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    ctxB = await browserPartner.newContext({
      viewport: { width: 390, height: 844 },
    });
  const a = await ctxA.newPage(),
    b = await ctxB.newPage();
  const errors = [];
  ctxA.setDefaultTimeout(12000);
  ctxB.setDefaultTimeout(12000);
  for (const p of [a, b])
    p.on("pageerror", (error) => errors.push(error.message));
  for (const p of [a, b])
    p.on("response", async (response) => {
      if (response.url().includes("/api/") && response.status() >= 400)
        console.error(
          "API failure",
          response.status(),
          new URL(response.url()).pathname,
          await response.text(),
        );
    });
  await a.goto(base);
  await a
    .getByRole("button", { name: "Войти в LoveLoom", exact: true })
    .waitFor();
  await a.evaluate(() => document.fonts.ready);
  await a.screenshot({
    path: join(output, "01-welcome-desktop.png"),
    fullPage: true,
  });
  assert.equal(await a.locator("[data-nextjs-dialog]").count(), 0);
  console.log(
    "PASS: page loads; logo and login render; no framework error overlay.",
  );
  const password = "browser-only-password-2026";
  async function register(page, name, email) {
    await page.goto(base);
    await page.getByRole("tab", { name: "Регистрация", exact: true }).click();
    await page.getByLabel("Ваше имя", { exact: true }).fill(name);
    await page.getByLabel("Электронная почта", { exact: true }).fill(email);
    await page.getByLabel("Пароль", { exact: true }).fill(password);
    await page.getByLabel("Мне исполнилось 14 лет").check();
    await page
      .getByRole("button", { name: "Создать аккаунт", exact: true })
      .click();
    await page.getByRole("button", { name: /Создать комнату/ }).waitFor();
  }
  await register(a, "Алекс", "alex@example.test");
  await a.getByRole("button", { name: /Создать комнату/ }).click();
  await a
    .getByLabel("Пароль комнаты", { exact: true })
    .fill("LOOM-OUR-STORY-2026");
  await a.getByLabel("Когда началась ваша история?").fill("2026-08-13");
  await a
    .getByRole("button", { name: "Создать бесплатно", exact: true })
    .click();
  await a.getByRole("heading", { name: "Здесь начинается «мы»." }).waitFor();
  await register(b, "Саша", "sasha@example.test");
  await b.getByRole("button", { name: /Войти в комнату/ }).click();
  await b
    .getByLabel("Пароль комнаты", { exact: true })
    .fill("LOOM-OUR-STORY-2026");
  await b.getByRole("button", { name: "Присоединиться", exact: true }).click();
  await b.getByRole("heading", { name: "Здесь начинается «мы»." }).waitFor();
  console.log(
    "PASS: two accounts register through UI; creator creates free room; second participant joins.",
  );
  const stateA = await ctxA.request
    .get(base + "/api/state")
    .then((r) => r.json());
  const payload = (body) => ({
    roomId: stateA.room.id,
    epoch: stateA.room.epoch,
    ...body,
  });
  const headers = { "x-csrf-token": stateA.csrf };
  const entries = [
    {
      kind: "event",
      title: "Вечер без телефонов",
      date: "2026-10-03",
      body: "Приготовить пасту и выбрать фильм.",
    },
    {
      kind: "memory",
      title: "Тот самый закат",
      date: "2026-09-20",
      body: "Долго гуляли, никуда не спешили и совершенно забыли про время.",
    },
    {
      kind: "note",
      title: "Куда поедем осенью?",
      body: "Выбрать небольшой город на выходные.",
    },
    {
      kind: "note",
      title: "Наш рецепт завтрака",
      body: "Блинчики, ягоды и неспешное утро.",
    },
    {
      kind: "wish",
      title: "Встретить рассвет у моря",
      body: "Однажды обязательно.",
    },
    { kind: "movie", title: "Мой сосед Тоторо", body: "Для уютного вечера." },
  ];
  for (const entry of entries) {
    const r = await ctxA.request.post(base + "/api/entries", {
      headers,
      data: payload(entry),
    });
    assert.equal(r.status(), 200);
  }
  await a.getByRole("button", { name: "Чат", exact: true }).first().click();
  await a
    .getByLabel("Сообщение", { exact: true })
    .fill("Как насчёт прогулки на выходных?");
  await a.getByRole("button", { name: "Отправить сообщение" }).click();
  await b.getByRole("button", { name: "Чат", exact: true }).last().click();
  await b
    .getByText("Как насчёт прогулки на выходных?", { exact: true })
    .waitFor();
  await b
    .getByLabel("Сообщение", { exact: true })
    .fill("Давай! Можно выбрать новое место.");
  await b.getByRole("button", { name: "Отправить сообщение" }).click();
  await a
    .getByText("Давай! Можно выбрать новое место.", { exact: true })
    .waitFor();

  const firstMessageOnB = b
    .locator(".message-row")
    .filter({
      has: b.locator(".message > p", {
        hasText: /^Как насчёт прогулки на выходных\?$/,
      }),
    })
    .first();
  await firstMessageOnB
    .getByRole("button", { name: "Ответить на сообщение" })
    .click();
  await b
    .getByLabel("Сообщение", { exact: true })
    .fill("Отвечаю именно на это сообщение.");
  await b.getByRole("button", { name: "Отправить сообщение" }).click();
  await b
    .locator(".message-row")
    .filter({ hasText: "Отвечаю именно на это сообщение." })
    .locator(".message-reply-preview")
    .waitFor();

  await firstMessageOnB
    .getByRole("button", { name: "Добавить реакцию" })
    .click();
  await firstMessageOnB
    .getByRole("button", { name: "Поставить реакцию 💗" })
    .click();
  await firstMessageOnB
    .getByRole("button", { name: "💗, реакций: 1" })
    .waitFor();

  await a.getByRole("button", { name: "Главная", exact: true }).first().click();
  await a.getByRole("button", { name: /Чат/ }).first().click();
  await a
    .getByText("Отвечаю именно на это сообщение.", { exact: true })
    .waitFor();
  const firstMessageOnA = a
    .locator(".message-row")
    .filter({
      has: a.locator(".message > p", {
        hasText: /^Как насчёт прогулки на выходных\?$/,
      }),
    })
    .first();
  await firstMessageOnA
    .getByRole("button", { name: "💗, реакций: 1" })
    .waitFor();
  await firstMessageOnA.locator(".thread-status.is-read").waitFor();

  await b.getByRole("button", { name: "Главная", exact: true }).last().click();
  await a
    .getByLabel("Сообщение", { exact: true })
    .fill("Сообщение для счётчика непрочитанного.");
  await a.getByRole("button", { name: "Отправить сообщение" }).click();
  await b
    .getByRole("button", { name: /Чат, непрочитанных сообщений: 1/ })
    .last()
    .waitFor({ timeout: 16000 });
  await b
    .getByRole("button", { name: /Чат, непрочитанных сообщений: 1/ })
    .last()
    .click();
  await b
    .getByText("Сообщение для счётчика непрочитанного.", { exact: true })
    .waitFor();
  await b.screenshot({
    path: join(output, "04-chat-mobile.png"),
    fullPage: true,
  });
  console.log(
    "PASS: chat replies, reactions, read status and durable unread badge work for two users.",
  );
  await a.getByRole("button", { name: "Главная", exact: true }).first().click();
  await a.getByText("Тот самый закат", { exact: true }).waitFor();
  await a.evaluate(() => document.fonts.ready);
  await a.screenshot({
    path: join(output, "02-dashboard-desktop.png"),
    fullPage: true,
  });
  await b.getByRole("button", { name: "Главная", exact: true }).last().click();
  await b.getByText("Тот самый закат", { exact: true }).waitFor();
  await b.screenshot({
    path: join(output, "03-dashboard-mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Mobile layout overflows",
  );
  await a
    .getByRole("button", { name: "Тёмная тема", exact: true })
    .first()
    .click();
  await a.screenshot({
    path: join(output, "05-dashboard-dark.png"),
    fullPage: true,
  });
  await a
    .getByRole("button", { name: "Светлая тема", exact: true })
    .first()
    .click();
  console.log(
    "PASS: desktop and mobile rendering, no horizontal overflow; light/dark themes.",
  );
  await ctxA.grantPermissions(["geolocation"], { origin: base });
  await ctxA.setGeolocation({ latitude: 55.7558, longitude: 37.6173 });
  await a.getByRole("button", { name: "Поделиться", exact: true }).click();
  await a
    .getByRole("button", { name: "Разрешить и поделиться", exact: true })
    .click();
  await a
    .getByText("Примерное местоположение обновлено.", { exact: true })
    .waitFor();
  const locationState = await ctxA.request
    .get(base + "/api/state")
    .then((r) => r.json());
  assert.equal(locationState.locationShared, true);
  await a.getByRole("button", { name: "Закрыть", exact: true }).click();
  console.log(
    "PASS: geolocation starts from a user click and persists only the consented approximate location.",
  );
  await a
    .getByRole("button", { name: "Для двоих", exact: true })
    .first()
    .click();
  await a
    .getByRole("heading", { name: /Чуть ближе/ })
    .waitFor();
  await a.getByText("Тактильность", { exact: true }).waitFor();
  await a.getByText("Виртуальный сад", { exact: true }).waitFor();
  await a.getByText("Общий фотоальбом", { exact: true }).waitFor();
  await a.getByText("Капсула времени", { exact: true }).waitFor();
  await a.getByRole("button", { name: "Отправить тактильное сердце" }).waitFor();
  assert.match(
    await a
      .getByRole("button", { name: "Отправить тактильное сердце" })
      .locator("img")
      .getAttribute("src"),
    /loveloom-mark\.png/,
  );
  await a.getByLabel("Стадия сада 1 из 4").waitFor();
  await a
    .getByText("Хранятся три последние капсулы.", { exact: false })
    .waitFor();
  await a.screenshot({
    path: join(output, "06-moments-desktop.png"),
    fullPage: true,
  });
  await b
    .getByRole("button", { name: "Для двоих", exact: true })
    .last()
    .click();
  await b
    .getByRole("heading", { name: /Чуть ближе/ })
    .waitFor();
  assert.ok(
    await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Moments mobile layout overflows",
  );
  await b.screenshot({
    path: join(output, "07-moments-mobile.png"),
    fullPage: true,
  });
  console.log(
    "PASS: tactile logo, album, four-stage garden and three-capsule notice render on desktop and mobile.",
  );

  await a
    .getByRole("button", { name: /Знаю тебя/ })
    .click();
  await a.getByRole("dialog", { name: "Знаю тебя" }).waitFor();
  const ownerKnowFlow = a.locator(".know-answer-flow");
  await ownerKnowFlow.locator("fieldset").nth(0).getByRole("button").first().click();
  await ownerKnowFlow.locator("fieldset").nth(1).getByRole("button").nth(1).click();
  await a
    .getByRole("button", { name: "Сохранить два ответа" })
    .click();
  await a.getByText("Ваша ниточка уже здесь", { exact: true }).waitFor();

  await b.getByRole("button", { name: "Профиль", exact: true }).click();
  await b.getByRole("button", { name: "Для двоих", exact: true }).last().click();
  await b.locator(".game-card.game-know").click();
  await b.getByRole("dialog", { name: "Знаю тебя" }).waitFor();
  const partnerKnowFlow = b.locator(".know-answer-flow");
  await partnerKnowFlow.locator("fieldset").nth(0).getByRole("button").nth(1).click();
  await partnerKnowFlow.locator("fieldset").nth(1).getByRole("button").first().click();
  await b
    .getByRole("button", { name: "Сохранить два ответа" })
    .click();
  await b.locator(".round-results").waitFor();
  await b.screenshot({
    path: join(output, "08-game-results-mobile.png"),
    fullPage: false,
    timeout: 30000,
  });
  await b.getByRole("button", { name: "Закрыть игру" }).click();
  await a.locator(".round-results").waitFor({ timeout: 16000 });
  await a.screenshot({
    path: join(output, "09-game-results-desktop.png"),
    fullPage: false,
    timeout: 30000,
  });
  await a.getByRole("button", { name: "Закрыть игру" }).click();

  await a
    .getByRole("button", { name: /Колесо решений/ })
    .click();
  await a.getByRole("dialog", { name: "Колесо решений" }).waitFor();
  for (const option of ["Музей", "Пикник", "Поездка", "Концерт"]) {
    await a.getByRole("button", { name: "Добавить вариант" }).click();
    await a.locator(".wheel-option-list input").last().fill(option);
  }
  assert.equal(await a.locator(".wheel-option-list input").count(), 8);
  assert.equal(
    await a.getByRole("button", { name: "Добавить вариант" }).isDisabled(),
    true,
  );
  await a.getByRole("button", { name: "Крутить колесо" }).click();
  await a.locator(".wheel-result-screen").waitFor({ timeout: 6000 });
  assert.equal(await a.locator(".confetti-field i").count(), 36);
  await a.screenshot({
    path: join(output, "10-wheel-winner-desktop.png"),
    fullPage: false,
    timeout: 30000,
  });
  await a
    .getByRole("button", { name: "Отличный выбор" })
    .click();
  console.log(
    "PASS: full-screen game flow synchronizes both answers; wheel accepts eight options and reveals an animated winner.",
  );
  await a.getByRole("button", { name: "Настройки", exact: true }).first().click();
  await a.getByRole("button", { name: "Выбрать", exact: true }).click();
  await a.getByRole("button", { name: /Небесный лён/ }).click();
  await a.getByRole("button", { name: "Готово", exact: true }).click();
  assert.ok(await a.locator(".app-shell.wallpaper-sky-linen").count());
  await a.reload();
  await a.getByRole("heading", { name: "Здесь начинается «мы»." }).waitFor();
  assert.ok(await a.locator(".app-shell.wallpaper-sky-linen").count());
  console.log("PASS: room wallpaper selection persists after reload.");
  await a.getByRole("button", { name: "Вместе", exact: true }).first().click();
  await a.getByRole("tab", { name: "Заметки", exact: true }).click();
  await a
    .getByRole("button", { name: "Добавить заметку", exact: true })
    .click();
  await a.getByLabel("Название", { exact: true }).fill("Проверка сохранения");
  await a
    .getByLabel("Несколько слов", { exact: true })
    .fill("Создано через интерфейс.");
  await a.getByRole("button", { name: "Сохранить", exact: true }).click();
  await a
    .getByRole("heading", { name: "Проверка сохранения", exact: true })
    .waitFor();
  await a.reload();
  await a.getByRole("heading", { name: "Здесь начинается «мы»." }).waitFor();
  const saved = await ctxA.request
    .get(base + "/api/state")
    .then((r) => r.json());
  assert.ok(saved.entries.some((e) => e.title === "Проверка сохранения"));
  console.log("PASS: note creation and persistence through reload.");
  const third = await request.newContext();
  await third.post(base + "/api/auth/register", {
    data: {
      name: "Third",
      email: "third@example.test",
      password,
      ageConfirmed: true,
    },
  });
  const stateC = await third.get(base + "/api/state").then((r) => r.json());
  const denied = await third.post(base + "/api/room", {
    headers: { "x-csrf-token": stateC.csrf },
    data: { action: "join", code: "LOOM-OUR-STORY-2026" },
  });
  assert.equal(denied.status(), 409);
  assert.match((await denied.json()).error, /все дома/);
  assert.equal((await third.get(base + "/api/messages")).status(), 409);
  const forgery = await ctxA.request.post(base + "/api/messages", {
    headers: { origin: "https://foreign.invalid", "x-csrf-token": stateA.csrf },
    data: payload({ text: "forged" }),
  });
  assert.equal(forgery.status(), 403);
  const csrf = await ctxA.request.post(base + "/api/messages", {
    data: payload({ text: "no csrf" }),
  });
  assert.equal(csrf.status(), 403);
  console.log(
    "PASS: third-party access, cross-origin requests and missing CSRF token rejected.",
  );
  await b.getByRole("button", { name: "Профиль", exact: true }).click();
  await b
    .getByRole("button", { name: "Выйти из комнаты", exact: true })
    .click();
  await b.locator('input[name="confirm"]').fill("УДАЛИТЬ ИСТОРИЮ");
  await b
    .getByRole("button", { name: "Подтвердить удаление", exact: true })
    .click();
  await b.getByRole("button", { name: /Создать комнату/ }).waitFor();
  const erased = await ctxA.request
    .get(base + "/api/state")
    .then((r) => r.json());
  assert.equal(erased.room.members.length, 1);
  assert.equal(erased.entries.length, 0);
  const msgs = await ctxA.request
    .get(base + "/api/messages")
    .then((r) => r.json());
  assert.equal(msgs.messages.length, 0);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: leaving erases both histories; zero browser runtime errors.",
  );
  console.log("Browser verification complete. Screenshots: test-results/");
} catch (error) {
  if (browser) {
    for (const [i, c] of browser.contexts().entries()) {
      const p = c.pages()[0];
      if (p) {
        await p
          .screenshot({ path: join(output, `error-${i}.png`), fullPage: true })
          .catch(() => {});
        console.error(
          "Page state:",
          (
            await p
              .locator("body")
              .innerText()
              .catch(() => "")
          ).slice(-2000),
        );
      }
    }
  }
  throw error;
} finally {
  await browser?.close();
  await browserPartner?.close();
  server.kill("SIGTERM");
}
