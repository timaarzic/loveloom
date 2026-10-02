import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, normalizedCode } from "../lib/store.ts";
import {
  correctGameAnswer,
  GAME_KINDS,
  GAME_QUESTIONS,
} from "../lib/game-content.ts";
async function fixture() {
  const path = mkdtempSync(join(tmpdir(), "loveloom-test-"));
  const db = new Store(path);
  const make = async (n: string) => {
    const result = await db.register({
      name: n,
      email: `${n}@example.test`,
      password: "test-only-password-2026",
      ageConfirmed: true,
    });
    return { ...db.session(result.token)!, token: result.token };
  };
  const a = await make("Owner"),
    b = await make("Partner"),
    c = await make("Third");
  db.createRoom(a.id, {
    code: "LOOM-TEST-ONLY-ROOM",
    start: "2026-08-13",
    timezone: "Europe/Moscow",
  });
  return { db, path, a, b, c, epoch: 1, code: "LOOM-TEST-ONLY-ROOM" };
}
test("unique case-insensitive codes; free creation; one room per account", async () => {
  const { db, a, b, code } = await fixture();
  assert.equal(db.roomFor(a.id)?.billing, "free");
  assert.throws(
    () => db.createRoom(b.id, { code: code.toLowerCase() }),
    /занят/,
  );
  assert.throws(
    () => db.createRoom(a.id, { code: "ANOTHER-ROOM-12345" }),
    /уже/,
  );
  assert.equal(normalizedCode(code.toLowerCase()), code);
  db.close();
});
test("server denies third member and database trigger prevents direct third insertion", async () => {
  const { db, a, b, c, code } = await fixture();
  db.joinRoom(b.id, { code });
  assert.throws(() => db.joinRoom(c.id, { code }), /все дома/);
  const room = db.roomFor(a.id)!;
  assert.equal(room.members.length, 2);
  assert.throws(
    () =>
      db.db
        .prepare("INSERT INTO members(user,room) VALUES(?,?)")
        .run(c.id, room.id),
    /ROOM_FULL/,
  );
  db.close();
});
test("messages isolate rooms, persist across reopen, paginate without duplicates", async () => {
  const { db, path, a, b, c, code, epoch } = await fixture();
  db.joinRoom(b.id, { code });
  db.createRoom(c.id, { code: "SEPARATE-ROOM-12345" });
  for (let i = 0; i < 45; i++)
    db.addMessage(a.id, { text: `Message ${i}`, epoch });
  const recent = db.messages(b.id);
  assert.equal(recent.messages.length, 40);
  assert.equal(recent.hasMore, true);
  assert.equal(db.messages(c.id).messages.length, 0);
  const older = db.messages(b.id, recent.messages[0].seq);
  assert.equal(older.messages.length, 5);
  assert.equal(older.hasMore, false);
  db.close();
  const again = new Store(path);
  assert.equal(again.messages(b.id).messages.at(-1)?.text, "Message 44");
  again.close();
});
test("threaded chat validates replies, groups reactions and tracks reads", async () => {
  const { db, a, b, c, code, epoch } = await fixture();
  db.joinRoom(b.id, { code });
  db.createRoom(c.id, { code: "SEPARATE-THREAD-ROOM" });

  const firstId = db.addMessage(a.id, { text: "Первое", epoch });
  const replyId = db.addMessage(b.id, {
    text: "Ответ",
    replyTo: firstId,
    epoch,
  });
  const otherRoomMessage = db.addMessage(c.id, {
    text: "Чужая комната",
    epoch,
  });

  const thread = db.messages(a.id);
  assert.deepEqual(
    thread.messages.find((message) => message.id === replyId)?.reply,
    {
      id: firstId,
      author: a.id,
      text: "Первое",
      mediaKind: null,
    },
  );
  assert.throws(
    () =>
      db.addMessage(a.id, {
        text: "Нельзя ответить",
        replyTo: otherRoomMessage,
        epoch,
      }),
    /недоступно/,
  );

  db.reactMessage(a.id, { id: firstId, emoji: "💗", epoch });
  db.reactMessage(b.id, { id: firstId, emoji: "💗", epoch });
  assert.equal(
    db.messages(a.id).messages.find((message) => message.id === firstId)
      ?.reactions?.[0].users.length,
    2,
  );
  db.reactMessage(a.id, { id: firstId, emoji: "💗", epoch });
  assert.equal(
    db.messages(a.id).messages.find((message) => message.id === firstId)
      ?.reactions?.[0].users.length,
    1,
  );
  assert.throws(
    () => db.reactMessage(a.id, { id: firstId, emoji: "🔥", epoch }),
    /не поддерживается/,
  );
  assert.throws(
    () => db.reactMessage(c.id, { id: firstId, emoji: "💗", epoch }),
    /недоступно/,
  );

  const unread = db.chatUnread(b.id, { epoch });
  assert.equal(unread.unread, 1);
  assert.equal(unread.latestSeq, thread.messages.at(-1)?.seq);
  const marked = db.markChatRead(b.id, {
    epoch,
    lastSeq: unread.latestSeq,
  });
  assert.equal(marked.lastReadSeq, unread.latestSeq);
  assert.equal(db.chatUnread(b.id, { epoch }).unread, 0);
  assert.equal(db.messages(a.id).partnerReadSeq, unread.latestSeq);
  db.close();
});
test("chat retains 1000 newest messages and safely clears expired reply previews", async () => {
  const { db, a, b, code, epoch } = await fixture();
  db.joinRoom(b.id, { code });
  const oldestId = db.addMessage(a.id, { text: "Message 0", epoch });
  for (let index = 1; index < 1000; index += 1)
    db.addMessage(a.id, { text: `Message ${index}`, epoch });
  const replyId = db.addMessage(b.id, {
    text: "Newest reply",
    replyTo: oldestId,
    epoch,
  });
  const count = db.db
    .prepare("SELECT COUNT(*) AS count FROM messages WHERE room=?")
    .get(db.roomFor(a.id)!.id) as { count: number };
  assert.equal(count.count, 1000);
  assert.equal(
    db.db.prepare("SELECT 1 FROM messages WHERE id=?").get(oldestId),
    undefined,
  );
  assert.equal(
    db.messages(b.id).messages.find((message) => message.id === replyId)?.reply,
    null,
  );
  db.close();
});
test("leave destroys shared records, rejects stale writes, allows empty rejoin", async () => {
  const { db, a, b, code, epoch } = await fixture();
  db.joinRoom(b.id, { code });
  db.addMessage(a.id, { text: "private", epoch });
  db.saveEntry(a.id, { kind: "note", title: "private note", epoch });
  db.location(a.id, { consent: true, lat: 50, lon: 30, epoch });
  db.startGame(a.id, { kind: "either", epoch });
  db.leaveRoom(b.id, { confirm: "УДАЛИТЬ ИСТОРИЮ", epoch });
  assert.equal(db.roomFor(b.id), null);
  assert.equal(db.roomFor(a.id)?.code, code);
  assert.equal(db.roomFor(a.id)?.epoch, 2);
  assert.equal(db.messages(a.id).messages.length, 0);
  assert.equal(db.snapshot(a).entries.length, 0);
  assert.equal(db.snapshot(a).locationShared, false);
  assert.equal(db.gameState(a.id), null);
  assert.throws(
    () => db.addMessage(a.id, { text: "stale draft", epoch }),
    /изменилась/,
  );
  assert.throws(
    () => db.addMessage(b.id, { text: "unauthorized", epoch }),
    /не состоите/,
  );
  db.joinRoom(b.id, { code });
  assert.equal(db.messages(b.id).messages.length, 0);
  db.close();
});
test("only owner can delete room / change relationship date; owner cannot leave", async () => {
  const { db, a, b, code, epoch } = await fixture();
  db.joinRoom(b.id, { code });
  assert.throws(
    () => db.deleteRoom(b.id, { confirm: "УДАЛИТЬ КОМНАТУ", epoch }),
    /создатель/,
  );
  assert.throws(
    () => db.updateRoom(b.id, { start: "2026-01-01", epoch }),
    /создатель/,
  );
  assert.throws(
    () => db.leaveRoom(a.id, { confirm: "УДАЛИТЬ ИСТОРИЮ", epoch }),
    /Создатель/,
  );
  db.deleteRoom(a.id, { confirm: "УДАЛИТЬ КОМНАТУ", epoch });
  assert.equal(db.roomFor(a.id), null);
  assert.equal(db.roomFor(b.id), null);
  db.close();
});
test("entry optimistic concurrency and cross-room update rejection", async () => {
  const { db, a, b, c, code, epoch } = await fixture();
  db.joinRoom(b.id, { code });
  db.createRoom(c.id, { code: "SEPARATE-ROOM-12345" });
  db.saveEntry(a.id, { kind: "note", title: "First", epoch });
  const entry = db.snapshot(a).entries[0];
  db.saveEntry(b.id, { ...entry, title: "Second", epoch });
  assert.throws(
    () => db.saveEntry(a.id, { ...entry, title: "Stale", epoch }),
    /изменил/,
  );
  assert.throws(
    () => db.saveEntry(c.id, { ...entry, title: "Cross room", epoch }),
    /не найдена/,
  );
  assert.equal(db.snapshot(a).entries[0].title, "Second");
  db.close();
});
test("answers are hidden until both respond; no double answering", async () => {
  const { db, a, b, code, epoch } = await fixture();
  db.joinRoom(b.id, { code });
  db.startGame(a.id, { kind: "either", epoch });
  const game = db.gameState(a.id)!;
  db.answerGame(a.id, { id: game.id, answer: game.choices[0], epoch });
  assert.equal(db.gameState(b.id)?.responses[0].answer, null);
  assert.throws(() => db.startGame(b.id, { kind: "quiz", epoch }), /завершите/);
  assert.throws(
    () => db.answerGame(a.id, { id: game.id, answer: game.choices[1], epoch }),
    /уже принят/,
  );
  db.answerGame(b.id, { id: game.id, answer: game.choices[1], epoch });
  assert.equal(db.gameState(a.id)?.complete, true);
  assert.ok(db.gameState(a.id)?.responses.every((r) => r.answer !== null));
  db.startGame(a.id, { kind: "either", epoch });
  assert.notEqual(db.gameState(a.id)?.question, game.question);
  db.close();
});
test("each pair game has 20 unique validated questions", () => {
  for (const kind of GAME_KINDS) {
    const questions = GAME_QUESTIONS[kind];
    assert.equal(questions.length, 20, `${kind} must contain 20 questions`);
    assert.equal(
      new Set(questions.map((question) => question.question)).size,
      20,
      `${kind} questions must be unique`,
    );
    for (const question of questions) {
      assert.ok(question.choices.length >= 2 && question.choices.length <= 4);
      assert.equal(new Set(question.choices).size, question.choices.length);
    }
  }
  for (const question of GAME_QUESTIONS.quiz)
    assert.ok(
      (question.choices as readonly string[]).includes(question.correctAnswer),
    );
});
test("explicit geolocation consent, server rounding, no coordinates in snapshot", async () => {
  const { db, a, b, code, epoch } = await fixture();
  db.joinRoom(b.id, { code });
  assert.throws(
    () => db.location(a.id, { lat: 40.1234, lon: 30.1234, epoch }),
    /согласия/,
  );
  db.location(a.id, { lat: 40.1234, lon: 30.1234, consent: true, epoch });
  db.location(b.id, { lat: 41, lon: 31, consent: true, epoch });
  const raw = db.db
    .prepare("SELECT lat,lon FROM locations WHERE user=?")
    .get(a.id)!;
  assert.equal(raw.lat, 40.1);
  assert.ok((db.snapshot(a).distance || 0) > 0);
  assert.ok(!JSON.stringify(db.snapshot(a)).includes("40.1"));
  db.location(a.id, { clear: true, epoch });
  assert.equal(db.snapshot(a).distance, null);
  db.close();
});
test("know game validates and conceals predictions until both participants answer", async () => {
  const { db, a, b, code, epoch } = await fixture();
  db.joinRoom(b.id, { code });
  db.startGame(a.id, { kind: "know", epoch });
  const game = db.gameState(a.id)!;
  assert.throws(
    () =>
      db.answerGame(a.id, {
        id: game.id,
        answer: game.choices[0],
        guess: "invalid",
        epoch,
      }),
    /предполагаемый/,
  );
  db.answerGame(a.id, {
    id: game.id,
    answer: game.choices[0],
    guess: game.choices[1],
    epoch,
  });
  assert.equal(db.gameState(a.id)?.responses[0].guess, game.choices[1]);
  assert.equal(db.gameState(b.id)?.responses[0].guess, null);
  assert.equal(db.gameState(b.id)?.responses[0].answer, null);
  db.answerGame(b.id, {
    id: game.id,
    answer: game.choices[1],
    guess: game.choices[0],
    epoch,
  });
  const result = db.gameState(a.id)!;
  assert.equal(result.complete, true);
  assert.equal(
    result.responses.find((r) => r.user === a.id)?.guess,
    result.responses.find((r) => r.user === b.id)?.answer,
  );
  assert.equal(
    result.responses.find((r) => r.user === b.id)?.guess,
    result.responses.find((r) => r.user === a.id)?.answer,
  );
  db.close();
});
test("quiz solution is revealed only after both answers", async () => {
  const { db, a, b, code, epoch } = await fixture();
  db.joinRoom(b.id, { code });
  db.startGame(a.id, { kind: "quiz", epoch });
  const game = db.gameState(a.id)!;
  assert.equal(game.correctAnswer, null);
  db.answerGame(a.id, { id: game.id, answer: game.choices[0], epoch });
  assert.equal(db.gameState(b.id)?.correctAnswer, null);
  db.answerGame(b.id, { id: game.id, answer: game.choices[1], epoch });
  const expected = correctGameAnswer(game.question);
  assert.ok(expected);
  assert.equal(db.gameState(a.id)?.correctAnswer, expected);
  assert.equal(db.gameState(b.id)?.correctAnswer, expected);
  db.close();
});
test("passwords and room codes not stored in plaintext; session revoked on logout", async () => {
  const { db, a } = await fixture();
  const row = db.db.prepare("SELECT password FROM users WHERE id=?").get(a.id)!;
  assert.notEqual(row.password, "test-only-password-2026");
  const room = db.db.prepare("SELECT code FROM rooms").get()!;
  assert.notEqual(room.code, "LOOM-TEST-ONLY-ROOM");
  assert.ok(db.session(a.token));
  db.logout(a.token);
  assert.equal(db.session(a.token), null);
  await assert.rejects(
    () => db.login({ email: "Owner@example.test", password: "wrong-password" }),
    /не совпадают/,
  );
  db.close();
});
test("admin bootstrap is owner-token protected and single use; no personal content", async () => {
  const { db } = await fixture();
  process.env.LOVELOOM_ADMIN_SETUP_TOKEN = "local-test-bootstrap-only";
  await assert.rejects(
    () => db.setupAdmin("wrong", "separate-admin-password"),
    /недействительна/,
  );
  await db.setupAdmin("local-test-bootstrap-only", "separate-admin-password");
  await assert.rejects(
    () => db.setupAdmin("local-test-bootstrap-only", "another-admin-password"),
    /уже настроен/,
  );
  const token = await db.loginAdmin("separate-admin-password");
  const overview = db.adminOverview(token);
  assert.equal(overview.users.length, 3);
  assert.ok(!("messages" in overview));
  assert.ok(!JSON.stringify(overview).includes("LOOM-TEST-ONLY-ROOM"));
  assert.throws(() => db.adminOverview("wrong"), /Войдите/);
  delete process.env.LOVELOOM_ADMIN_SETUP_TOKEN;
  db.close();
});
test("persistent rate limiter enforces attempt budget", async () => {
  const { db } = await fixture();
  db.limited("one", 2);
  db.limited("one", 2);
  assert.throws(() => db.limited("one", 2), /Слишком много/);
  db.close();
});
