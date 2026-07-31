export function passwordStrengthScore(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  return Math.min(score, 4);
}

export function strengthLabel(score: number) {
  if (score <= 1) return "Débil";
  if (score === 2) return "Regular";
  if (score === 3) return "Buena";
  return "Fuerte";
}
