import test from 'node:test';
import assert from 'node:assert/strict';
import { isSessionExpired, IDLE_LOGOUT_AFTER_MS } from '../src/auth/sessionPolicy.ts';

const activity = 1_000_000;
test('requires login exactly at ten minutes, including after app termination', () => {
  assert.equal(isSessionExpired(activity, activity + IDLE_LOGOUT_AFTER_MS - 1), false);
  assert.equal(isSessionExpired(activity, activity + IDLE_LOGOUT_AFTER_MS), true);
  assert.equal(isSessionExpired(activity, activity + 60 * 60 * 1000), true);
});
test('a recent interaction permits a new ten-minute window', () => {
  assert.equal(isSessionExpired(activity + 9 * 60 * 1000, activity + 18 * 60 * 1000), false);
});
test('missing, invalid and future timestamps do not restore sessions', () => {
  for (const value of [0, -1, NaN, Infinity, activity + 1]) assert.equal(isSessionExpired(value, activity), true);
});
