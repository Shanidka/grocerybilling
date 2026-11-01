export function loyaltyEligible(phone: string | null | undefined) {
  return Boolean(phone?.replace(/\D/g, ""));
}

export function loyaltyReward(points: number, pointValue = 0.1) {
  return Math.round(Math.max(0, points) * pointValue * 100) / 100;
}

export function validateLoyaltySettings(earnPer: number, pointsPerRupee: number) {
  return Number.isFinite(earnPer) && earnPer > 0 && Number.isFinite(pointsPerRupee) && pointsPerRupee > 0;
}