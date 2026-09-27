import { chromium } from "@playwright/test";
import bundledChromium from "@sparticuz/chromium";
import { createServer } from "node:http";
import { readFileSync, statSync, mkdirSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { localChromium } from "./chromium-local.mjs";

const root = resolve("out"),
  output = resolve("test-results/beta");
mkdirSync(output, { recursive: true });
const mimes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};
const server = createServer((req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (!path.startsWith("/loveloom/")) {
      res.writeHead(404).end();
      return;
    }
    let file = resolve(root, path.slice("/loveloom/".length) || "index.html");
    if (!file.startsWith(root + "/") && file !== root) {
      res.writeHead(403).end();
      return;
    }
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    res
      .writeHead(200, {
        "Content-Type": mimes[extname(file)] || "application/octet-stream",
      })
      .end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/loveloom/`;
let browser, page;
try {
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
  page = await browser.newPage({ viewport: { width: 1440, height: 1060 } });
  const errors = [],
    failed = [],
    apiCalls = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  page.on("request", (r) => {
    if (r.url().includes("/api/")) apiCalls.push(r.url());
  });
  const nav = async (name) =>
    page.getByRole("button", { name, exact: true }).last().click();
  const home = async () => {
    await page
      .getByRole("button", { name: "Главная", exact: true })
      .first()
      .click();
  };
  await page.goto(base);
  await page.getByRole("heading", { name: "Здесь начинается «мы»." }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.evaluate(() => document.fonts.check("700 96px Caveat")));
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.equal(await page.locator(".widget-tile").count(), 6);
  await page.screenshot({
    path: join(output, "01-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Виджеты", exact: true }).click();
  await page.getByLabel("Заметки", { exact: true }).uncheck();
  await page.screenshot({
    path: join(output, "02-widgets.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Вот так нравится" }).click();
  assert.equal(await page.locator(".notes-card").isVisible(), false);
  await page.reload();
  await page.getByRole("heading", { name: "Здесь начинается «мы»." }).waitFor();
  assert.equal(await page.locator(".notes-card").isVisible(), false);
  await page.getByRole("button", { name: "Виджеты", exact: true }).click();
  await page.getByLabel("Заметки", { exact: true }).check();
  await page.getByRole("button", { name: "Вот так нравится" }).click();
  console.log(
    "PASS: handwritten fonts, six widgets, widget visibility persists after reload.",
  );
  for (const name of [
    "Календарь",
    "Воспоминания",
    "Заметки",
    "Желания",
    "Фильмы",
    "Музыка",
  ]) {
    await home();
    await page
      .locator(".widget-launcher")
      .getByRole("button", { name: new RegExp(name) })
      .click();
    assert.equal(
      await page
        .getByRole("tab", { name, exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
  }
  await page.getByRole("tab", { name: "Заметки", exact: true }).click();
  await page
    .getByRole("button", { name: "Добавить заметку", exact: true })
    .click();
  await page
    .getByLabel("Название", { exact: true })
    .fill("Проверка дизайн-беты");
  await page
    .getByLabel("Несколько слов", { exact: true })
    .fill("Сохраняется только в этом браузере.");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("heading", { name: "Проверка дизайн-беты" }).waitFor();
  await home();
  await page.getByRole("button", { name: "Открыть историю отношений" }).click();
  await page.getByRole("heading", { name: "Наша история — по дням" }).waitFor();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  console.log(
    "PASS: all six section widgets, note editor and story panel work.",
  );
  await nav("Чат");
  await page
    .getByLabel("Сообщение", { exact: true })
    .fill("Сообщение в дизайн-бете");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await page.getByText("Сообщение в дизайн-бете", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Роль:/ }).click();
  await page.getByText("Сообщение в дизайн-бете", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Звонки/ }).click();
  await page.getByRole("heading", { name: "Побыть рядом" }).waitFor();
  await page.getByRole("button", { name: "Пока — в чат" }).click();
  await nav("Игры");
  await page.locator(".game-either").click();
  await page.getByRole("button", { name: "К морю", exact: true }).click();
  await page.getByRole("button", { name: /Роль:/ }).click();
  await page.getByRole("button", { name: "В горы", exact: true }).click();
  await page.getByText("ВАШИ ОТВЕТЫ", { exact: true }).waitFor();
  console.log(
    "PASS: local preview chat, role switching, call status panel and two-answer game.",
  );
  await home();
  await page
    .getByRole("button", { name: "Тёмная тема", exact: true })
    .first()
    .click();
  await page.screenshot({ path: join(output, "03-dark.png"), fullPage: true });
  await page
    .getByRole("button", { name: "Светлая тема", exact: true })
    .first()
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(output, "04-mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await nav("Чат");
  await page.screenshot({
    path: join(output, "05-chat-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Экран входа", exact: true }).click();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Электронная почта" })
      .getAttribute("readonly"),
    "",
  );
  await page
    .getByRole("button", { name: "Войти в LoveLoom", exact: true })
    .click();
  await page.getByRole("button", { name: /Создать комнату/ }).waitFor();
  await page
    .getByRole("button", { name: /Создатель T&A/ })
    .last()
    .click();
  await page.getByText(/Админка доступна только владельцу/).waitFor();
  assert.equal(await page.locator("dialog input").count(), 0);
  assert.deepEqual(apiCalls, []);
  assert.deepEqual(failed, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: mobile and dark theme, safe readonly auth preview, no exposed admin form, no API calls, asset failures or runtime errors.",
  );
} catch (error) {
  if (page)
    await page
      .screenshot({ path: join(output, "error.png"), fullPage: true })
      .catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close();
  server.close();
}
