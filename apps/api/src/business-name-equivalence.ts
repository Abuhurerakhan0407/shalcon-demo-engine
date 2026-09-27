const GENERIC_TOKENS = new Set([
  'salon',
  'salons',
  'spa',
  'beauty',
  'hair',
  'branch',
  'mumbai',
  'bandra',
  'juhu',
  'khar',
  'andheri',
  'goregaon',
  'west',
  'east',
  'the',
  'in',
  'aesthetics',
  'beyond',
]);

function tokens(value: string): string[] {
  const ascii = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('en-IN');
  return (ascii.match(/[a-z0-9]+/gu) ?? []).filter((token) => !GENERIC_TOKENS.has(token));
}

export function businessNamesEquivalent(left: string, right: string): boolean {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;

  const [shorter, longer] =
    leftTokens.size <= rightTokens.size
      ? [leftTokens, rightTokens]
      : [rightTokens, leftTokens];

  if (![...shorter].every((token) => longer.has(token))) return false;
  return [...shorter].some((token) => token.length >= 4);
}
