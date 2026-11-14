import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFlow } from '../src/scripts/choreo/flow.ts';
import { RIG } from '../src/scripts/choreo/timeline.ts';

const knots = RIG.map((s) => s.t);
const flow = makeFlow(knots);

test('every shot lands exactly on its own place on the curves', () => {
  knots.forEach((t, k) => assert.ok(Math.abs(flow.at(t) - k / (knots.length - 1)) < 1e-9, `shot ${RIG[k]!.id}`));
});

test('the camera never runs backwards', () => {
  let prev = -1;
  for (let p = 0; p <= 1; p += 0.0005) { const u = flow.at(p); assert.ok(u >= prev - 1e-12, `p ${p}`); prev = u; }
});

test('speed has no jumps at the shots', () => {
  const eps = 1e-6;
  knots.slice(1, -1).forEach((t, k) => {
    const before = (flow.at(t) - flow.at(t - eps)) / eps, after = (flow.at(t + eps) - flow.at(t)) / eps;
    assert.ok(Math.abs(before - after) / Math.max(before, after) < 0.01, `shot ${RIG[k + 1]!.id}: ${before} vs ${after}`);
  });
});
