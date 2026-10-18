export function cashTender(due: number, current: number, increment: number): number {
  return Math.round((Math.max(due, current) + increment) * 100) / 100;
}