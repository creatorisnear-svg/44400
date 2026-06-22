export type Action = "hit" | "stand" | "double" | "split";

function cardValue(card: string): number {
  const rank = card.replace(/[♠♥♦♣shdcSHDC]/, "").trim();
  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  return parseInt(rank, 10) || 0;
}

function handValue(cards: string[]): { value: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const v = cardValue(card);
    if (v === 11) aces++;
    total += v;
  }
  let soft = false;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  if (aces > 0 && total <= 21) soft = true;
  return { value: total, soft };
}

export function basicStrategy(
  playerCards: string[],
  dealerUpCard: string,
  canDouble: boolean,
  canSplit: boolean,
  strategy: "basic" | "aggressive" | "conservative" = "basic",
): Action {
  const dealer = cardValue(dealerUpCard);
  const { value: player, soft } = handValue(playerCards);

  const isPair =
    playerCards.length === 2 &&
    cardValue(playerCards[0]) === cardValue(playerCards[1]);

  if (canSplit && isPair && strategy !== "conservative") {
    const pairRank = cardValue(playerCards[0]);
    if (pairRank === 11) return "split";
    if (pairRank === 8) return "split";
    if (pairRank === 9 && dealer !== 7 && dealer < 10 && dealer !== 11)
      return "split";
    if (pairRank === 7 && dealer <= 7) return "split";
    if (pairRank === 6 && dealer <= 6) return "split";
    if (pairRank === 4 && (dealer === 5 || dealer === 6)) return "split";
    if ((pairRank === 2 || pairRank === 3) && dealer <= 7) return "split";
  }

  if (soft) {
    if (player >= 20) return "stand";
    if (player === 19) {
      if (canDouble && dealer >= 6 && strategy === "aggressive") return "double";
      return "stand";
    }
    if (player === 18) {
      if (canDouble && dealer >= 3 && dealer <= 6) return "double";
      if (dealer >= 9 || dealer === 11) return "hit";
      return "stand";
    }
    if (player === 17) {
      if (canDouble && dealer >= 3 && dealer <= 6) return "double";
      return "hit";
    }
    if (player === 15 || player === 16) {
      if (canDouble && dealer >= 4 && dealer <= 6) return "double";
      return "hit";
    }
    if (player === 13 || player === 14) {
      if (canDouble && dealer >= 5 && dealer <= 6) return "double";
      return "hit";
    }
    return "hit";
  }

  if (player >= 17) return "stand";
  if (player >= 13 && player <= 16) {
    if (dealer <= 6) return "stand";
    if (strategy === "conservative" && player >= 15) return "stand";
    return "hit";
  }
  if (player === 12) {
    if (dealer >= 4 && dealer <= 6) return "stand";
    return "hit";
  }
  if (player === 11) {
    if (canDouble) return "double";
    return "hit";
  }
  if (player === 10) {
    if (canDouble && dealer <= 9) return "double";
    return "hit";
  }
  if (player === 9) {
    if (canDouble && dealer >= 3 && dealer <= 6 && strategy !== "conservative")
      return "double";
    return "hit";
  }
  return "hit";
}

export { handValue, cardValue };
