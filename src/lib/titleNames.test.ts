import { describe, expect, it } from 'vitest'
import { namesInTitle, titleNameWarning } from './titleNames'

const names = ['Bishop Avery', 'Brother Lane', 'Sister Rosa Ortiz-Kim', null]

describe('namesInTitle', () => {
  it('finds a first or last name as a whole word, in any case', () => {
    expect(namesInTitle('Avery interviews', names)).toEqual(['Avery'])
    expect(namesInTitle('talk with LANE', names)).toEqual(['Lane'])
    expect(namesInTitle('Rosa and Ortiz-Kim', names)).toEqual(['Rosa', 'Ortiz-Kim'])
  })
  it('ignores part-of-a-word matches', () => {
    expect(namesInTitle('Planes and Averys', names)).toEqual([])
  })
  it('ignores honorifics, so a general title is fine', () => {
    expect(namesInTitle('Bishop interviews', names)).toEqual([])
    expect(namesInTitle('Brother and Sister night', names)).toEqual([])
    expect(namesInTitle('Primary message', names)).toEqual([])
  })
  it('flags the rotation\'s own assignee label', () => {
    expect(namesInTitle('Tate speaks', names, 'Tate')).toEqual(['Tate'])
    expect(namesInTitle('Primary message', names, 'Tate')).toEqual([])
    expect(namesInTitle('Primary message', names, ' ')).toEqual([])
  })
  it('handles empty input and names with regex characters', () => {
    expect(namesInTitle('', names)).toEqual([])
    expect(() => namesInTitle('x (y)', ['A (y)', '', '[z'])).not.toThrow()
  })
})

describe('titleNameWarning', () => {
  it('is empty without names and lists them otherwise', () => {
    expect(titleNameWarning([])).toBe('')
    expect(titleNameWarning(['Avery', 'Lane'])).toContain('Avery, Lane')
  })
})
