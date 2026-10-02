import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GAME_KINDS, GAME_QUESTIONS } from "../lib/game-content.ts";

test("beta 0.6 migration seeds the exact reviewed 80-question catalog", () => {
  const sql = readFileSync(
    new URL(
      "../supabase/migrations/20261002131257_beta_060_chat_games.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const encoded = sql.match(/decode\('([^']+)', 'base64'\)/)?.[1];
  assert.ok(encoded, "question seed is missing from the migration");
  const seeded = JSON.parse(
    Buffer.from(encoded, "base64").toString("utf8"),
  );
  const expected = GAME_KINDS.flatMap((kind) =>
    GAME_QUESTIONS[kind].map((question, index) => ({
      kind,
      position: index + 1,
      question: question.question,
      choices: [...question.choices],
      correct_answer:
        "correctAnswer" in question ? question.correctAnswer : null,
    })),
  );
  assert.equal(seeded.length, 80);
  assert.deepEqual(seeded, expected);
});
