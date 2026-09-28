import assert from "node:assert/strict";
import test from "node:test";
import { encodePcm16Wav, VOICE_SAMPLE_RATE } from "../lib/voice.ts";

test("voice recorder produces a valid mono PCM WAV at a portable sample rate", () => {
  const sourceRate = 48_000;
  const samples = new Float32Array(sourceRate);
  for (let index = 0; index < samples.length; index += 1)
    samples[index] = Math.sin((index / sourceRate) * Math.PI * 2 * 440) * 0.5;

  const wav = encodePcm16Wav([samples.subarray(0, 20_000), samples.subarray(20_000)], sourceRate);
  const view = new DataView(wav);
  const text = (offset: number, length: number) =>
    String.fromCharCode(...new Uint8Array(wav, offset, length));

  assert.equal(text(0, 4), "RIFF");
  assert.equal(text(8, 4), "WAVE");
  assert.equal(text(36, 4), "data");
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), VOICE_SAMPLE_RATE);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), VOICE_SAMPLE_RATE * 2);
  assert.equal(wav.byteLength, 44 + VOICE_SAMPLE_RATE * 2);
});

test("voice encoder rejects empty input", () => {
  assert.throws(() => encodePcm16Wav([], 48_000), /пустой/);
});
