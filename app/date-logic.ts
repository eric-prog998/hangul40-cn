export function millisecondsUntilNextLocalMidnight(now = new Date()) {
  const nextMidnight = new Date(now.getTime());
  nextMidnight.setHours(24, 0, 0, 50);
  return Math.max(1, nextMidnight.getTime() - now.getTime());
}
