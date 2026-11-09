/** Count rendered route vertices at a travelled distance (measured along the polyline).
 * Distance-driven, not fraction-of-vertex-count: keeps progress correct on uneven roads.
 * Complexity O(log n) even for long AMap routes.
 */
export function visibleJourneyVertices(cumulative: readonly number[], distance: number): number {
  if (!cumulative.length) return 0
  if (!Number.isFinite(distance) || distance <= 0) return 1
  const n = cumulative.length
  if (distance >= cumulative[n - 1]!) return n
  let low = 0, high = n - 1
  while (low < high) {
    const mid = (low + high + 1) >>> 1
    if (cumulative[mid]! <= distance) low = mid
    else high = mid - 1
  }
  return Math.max(1, low + 1)
}
