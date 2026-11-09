/** 手动顺序优先；日期顺序把未填写日期的记忆点放在最后。 */
export type MemorySortMode = 'manual' | 'date'
export interface MemorySortable {
  id: number
  sortOrder: number
  travelDate: string | null
}
export function sortMemories<T extends MemorySortable>(input: readonly T[], mode: MemorySortMode): T[] {
  return [...input].sort((a, b) => {
    if (mode === 'date') {
      if (!a.travelDate && b.travelDate) return 1
      if (a.travelDate && !b.travelDate) return -1
      if (a.travelDate && b.travelDate) {
        const byDay = a.travelDate.localeCompare(b.travelDate)
        if (byDay) return byDay
      }
    }
    return a.sortOrder - b.sortOrder || a.id - b.id
  })
}
