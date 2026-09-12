export function backEase(percent: number): (t: number) => number {
  const strength = percent / 100;
  return (t) => t + strength * t * (1 - t);
}
