/** Convert contract, wallet, and RPC errors into short user-facing copy. */
export function friendlyError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  console.error("[Baskt] technical error", error);
  const normalized = message.toLowerCase();

  if (
    /user rejected|user denied|rejected the request|request rejected|cancelled|canceled|4001/.test(
      normalized,
    )
  ) {
    return "You cancelled the transaction in your wallet.";
  }
  if (/wrong network|unsupported chain|chain id|switch.*network|bradbury/.test(normalized)) {
    return "Switch to the Baskt network to continue.";
  }
  if (/duplicate market|already exists|market.*exists/.test(normalized)) {
    return "A market already exists for this asset and day.";
  }
  if (/target day must be in the future|future/.test(normalized)) {
    return "Choose a future day.";
  }
  if (/too far ahead|closer date|forward/.test(normalized)) {
    return "Choose a closer date.";
  }
  if (/minimum stake is 1 gen|minimum stake/.test(normalized)) {
    return "The minimum stake is 1 GEN.";
  }
  if (/maximum cumulative stake is 10 gen|maximum.*10 gen|10 gen/.test(normalized)) {
    return "You can stake up to 10 GEN on this market.";
  }
  if (/cannot switch sides|switch sides|opposite side/.test(normalized)) {
    return "You already chose the other side for this market.";
  }
  if (/market is locked|entries.*closed/.test(normalized)) {
    return "Entries are closed for this market.";
  }
  if (/market is not ready to settle|not ready to settle|not ready/.test(normalized)) {
    return "This market is not ready to settle yet.";
  }
  if (/market already finalized|already finalized/.test(normalized)) {
    return "This market has already been settled.";
  }
  if (/nothing claimable|nothing to claim/.test(normalized)) {
    return "There is nothing to claim.";
  }
  if (/position did not win|no payout/.test(normalized)) {
    return "This position has no payout.";
  }
  if (/insufficient funds|insufficient balance|not enough gen|balance too low/.test(normalized)) {
    return "You do not have enough GEN for this transaction.";
  }
  if (/market not found|invalid market id/.test(normalized)) {
    return "We couldn't find that market.";
  }
  if (
    /external|malformed_data|malformed data|transient|failed to fetch|timeout|timed out|rpc|genlayer|provider|returned an invalid/.test(
      normalized,
    )
  ) {
    return "Something went wrong while checking the market. Try again.";
  }
  if (/accounting|invariant|payout exceeds/.test(normalized)) {
    return "Something went wrong. Please try again later.";
  }
  return fallback;
}
