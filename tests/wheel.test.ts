import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wheelLabelAngle,
  wheelRotationForWinner,
  wheelWinnerIndex,
} from "../lib/wheel.ts";

function normalized(value: number) {
  return ((value % 360) + 360) % 360;
}

test("wheel result always matches the segment under the top pointer", () => {
  for (let optionCount = 2; optionCount <= 8; optionCount += 1) {
    let rotation = 0;
    for (let selectedIndex = 0; selectedIndex < optionCount; selectedIndex += 1) {
      rotation = wheelRotationForWinner(
        rotation,
        selectedIndex,
        optionCount,
      );
      assert.equal(
        wheelWinnerIndex(rotation, optionCount),
        selectedIndex,
        `${optionCount} options, winner ${selectedIndex}`,
      );

      const labelAtPointer = normalized(
        wheelLabelAngle(selectedIndex, optionCount) + rotation + 90,
      );
      assert.ok(
        labelAtPointer < 1e-8 || 360 - labelAtPointer < 1e-8,
        `${optionCount} options, label ${selectedIndex} is centered under the pointer`,
      );
    }
  }
});
