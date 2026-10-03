const FULL_TURN = 360;

function normalizedDegrees(value: number) {
  return ((value % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

export function wheelLabelAngle(index: number, optionCount: number) {
  const slice = FULL_TURN / optionCount;
  // CSS rotate(0deg) points to the right, while conic-gradient starts at the top.
  return (index + 0.5) * slice - 90;
}

export function wheelRotationForWinner(
  currentRotation: number,
  selectedIndex: number,
  optionCount: number,
  turns = 6,
) {
  const slice = FULL_TURN / optionCount;
  const selectedCenter = (selectedIndex + 0.5) * slice;
  const pointerTarget = normalizedDegrees(FULL_TURN - selectedCenter);
  return (
    Math.ceil(currentRotation / FULL_TURN) * FULL_TURN +
    Math.max(1, turns) * FULL_TURN +
    pointerTarget
  );
}

export function wheelWinnerIndex(rotation: number, optionCount: number) {
  const slice = FULL_TURN / optionCount;
  const angleUnderTopPointer = normalizedDegrees(FULL_TURN - rotation);
  return Math.min(optionCount - 1, Math.floor(angleUnderTopPointer / slice));
}
