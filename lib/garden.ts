export const gardenMilestones = [30, 50, 100] as const;

export function gardenStageForGrowth(value: number) {
  const growth = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  if (growth >= gardenMilestones[2]) return 3;
  if (growth >= gardenMilestones[1]) return 2;
  if (growth >= gardenMilestones[0]) return 1;
  return 0;
}

export function gardenProgress(value: number) {
  const growth = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const stage = gardenStageForGrowth(growth);
  const previous = stage === 0 ? 0 : gardenMilestones[stage - 1];
  const next = gardenMilestones.at(stage) ?? null;
  const percent = next
    ? Math.min(100, Math.max(0, ((growth - previous) / (next - previous)) * 100))
    : 100;

  return {
    stage,
    next,
    remaining: next ? Math.max(0, next - growth) : 0,
    percent,
  };
}
