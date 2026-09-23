import { describe, expect, it } from 'vitest';

import { isDueOnTick } from '@/lib/events/reminders';

describe('isDueOnTick — every event gets exactly one reminder', () => {
  it('sends important events the day before', () => {
    expect(isDueOnTick(true, 1)).toBe(true);
    expect(isDueOnTick(true, 0)).toBe(false);
  });

  it('sends every other event on the morning of', () => {
    expect(isDueOnTick(false, 0)).toBe(true);
    expect(isDueOnTick(false, 1)).toBe(false);
  });

  it('matches exactly one tick, so the two schedules cannot double-send', () => {
    for (const important of [true, false]) {
      const ticks = ([0, 1] as const).filter((lead) => isDueOnTick(important, lead));
      expect(ticks, `important=${important}`).toHaveLength(1);
    }
  });
});
