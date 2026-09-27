import assert from "node:assert/strict";
import test from "node:test";
import { gardenProgress, gardenStageForGrowth } from "../lib/garden.ts";
import { mediaExtensions, resolveMediaMime } from "../lib/media.ts";

test("garden grows at 30, 50 and 100 shared waterings", () => {
  assert.equal(gardenStageForGrowth(0), 0);
  assert.equal(gardenStageForGrowth(29), 0);
  assert.equal(gardenStageForGrowth(30), 1);
  assert.equal(gardenStageForGrowth(49), 1);
  assert.equal(gardenStageForGrowth(50), 2);
  assert.equal(gardenStageForGrowth(99), 2);
  assert.equal(gardenStageForGrowth(100), 3);
  assert.equal(gardenStageForGrowth(Number.NaN), 0);

  assert.deepEqual(gardenProgress(30), {
    stage: 1,
    next: 50,
    remaining: 20,
    percent: 0,
  });
  assert.equal(gardenProgress(40).percent, 50);
  assert.equal(gardenProgress(100).next, null);
});

test("mobile image MIME types are normalized before cloud upload", () => {
  assert.equal(resolveMediaMime("image/jpg", "camera.jpg"), "image/jpeg");
  assert.equal(resolveMediaMime("", "IMG_0001.HEIC"), "image/heic");
  assert.equal(
    resolveMediaMime("application/octet-stream", "photo.heif"),
    "image/heif",
  );
  assert.equal(resolveMediaMime("image/png", "photo.png"), "image/png");
  assert.equal(mediaExtensions["image/heic"], "heic");
  assert.equal(mediaExtensions["image/heif"], "heif");
});
