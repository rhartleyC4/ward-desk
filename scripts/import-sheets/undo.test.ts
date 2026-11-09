import { describe, expect, it } from 'vitest'
import { isRunId, undoReport, type UndoResult } from './undo'

describe('isRunId', () => {
  it('takes the form --apply prints', () => {
    expect(isRunId('2026-11-09T18:22:01.123456Z')).toBe(true)
  })

  it('refuses anything less exact, since it picks which rows are deleted', () => {
    expect(isRunId('2026-11-09')).toBe(false)
    expect(isRunId('2026-11-09T18:22:01Z')).toBe(false)
    expect(isRunId('2026-13-40T18:22:01.123456Z')).toBe(false)
    expect(isRunId("x' or 1=1")).toBe(false)
  })
})

describe('undoReport', () => {
  const result: UndoResult = {
    meetings: 2, programItems: 5, absences: 1, agendas: 1, agendaItems: 3, callings: 1, candidates: 2, prayerRoll: 4,
    changedSince: 0, linksCleared: 0,
  }

  it('says whether anything was removed', () => {
    expect(undoReport(result, false)[0]).toMatch(/^Dry run/)
    expect(undoReport(result, true)[0]).toBe('Removed:')
  })

  it('warns only when people have touched the rows', () => {
    expect(undoReport(result, true).join('\n')).not.toMatch(/after the import|without the link/)
    const report = undoReport({ ...result, changedSince: 2, linksCleared: 1 }, true).join('\n')
    expect(report).toMatch(/2 of these rows/)
    expect(report).toMatch(/1 requests or appointments/)
  })
})
