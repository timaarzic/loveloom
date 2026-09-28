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
await new Promise((resolveReady) =>
  server.listen(0, "127.0.0.1", resolveReady),
);
const base = `http://127.0.0.1:${server.address().port}/loveloom/`;
let browser;
let page;
try {
  browser = await chromium.launch(
    process.platform === "linux"
      ? {
          ...localChromium(),
          args: bundledChromium.args.filter(
            (arg) =>
              ![
                "--disable-web-security",
                "--allow-running-insecure-content",
              ].includes(arg),
          ),
          headless: true,
        }
      : { headless: true },
  );
  page = await browser.newPage({ viewport: { width: 1440, height: 1060 } });
  const errors = [];
  const failedStatic = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === new URL(base).origin && response.status() >= 400)
      failedStatic.push(`${response.status()} ${response.url()}`);
  });

  await page.goto(base);
  await page
    .getByRole("button", { name: "Войти в LoveLoom", exact: true })
    .waitFor();
  const workerUrl = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.scriptURL || "";
  });
  assert.match(workerUrl, /\/loveloom\/sw\.js$/);
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.evaluate(() => document.fonts.check("700 96px Caveat")));
  assert.equal(await page.locator(".beta-bar").count(), 0);
  assert.equal(
    await page
      .getByRole("textbox", { name: "Электронная почта" })
      .getAttribute("readonly"),
    null,
  );
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await page.getByRole("button", { name: "Не помню пароль", exact: true }).click();
  await page.getByRole("heading", { name: "Вернуть доступ", exact: true }).waitFor();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.screenshot({
    path: join(output, "01-cloud-welcome-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("tab", { name: "Регистрация", exact: true }).click();
  await page.getByLabel("Ваше имя", { exact: true }).fill("Тест");
  await page
    .getByLabel("Электронная почта", { exact: true })
    .fill("test@example.test");
  await page.getByLabel("Пароль", { exact: true }).fill("not-submitted-2026");
  await page.getByLabel("Мне исполнилось 14 лет").check();
  assert.equal(
    await page.getByRole("button", { name: "Создать аккаунт" }).isEnabled(),
    true,
  );
  console.log(
    "PASS: cloud beta starts at editable login/registration and no longer opens a demo room.",
  );

  await page
    .getByRole("button", { name: "Тёмная тема", exact: true })
    .first()
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Светлая тема", exact: true })
    .first()
    .waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await page.screenshot({
    path: join(output, "02-cloud-welcome-mobile.png"),
    fullPage: true,
  });
  console.log("PASS: theme persists after reload and mobile welcome has no overflow.");

  assert.deepEqual(failedStatic, []);
  assert.deepEqual(errors, []);
  console.log("PASS: no failed static assets or unhandled browser errors.");
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
