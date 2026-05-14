import { describe, it, expect } from 'vitest'
import { parseCsv, parseContactsCsv } from './csv'

describe('parseCsv', () => {
  it('parses basic rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles quoted fields with commas and newlines', () => {
    expect(parseCsv('"hello, world","line1\nline2",plain')).toEqual([
      ['hello, world', 'line1\nline2', 'plain'],
    ])
  })

  it('handles escaped quotes (``)', () => {
    expect(parseCsv('"she said ""hi"""')).toEqual([['she said "hi"']])
  })

  it('skips empty lines', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('parseContactsCsv', () => {
  it('reads a phone-only file with header', () => {
    const rows = parseContactsCsv('phone\n+8801711000001\n+8801711000002\n')
    expect(rows).toEqual([{ e164: '+8801711000001' }, { e164: '+8801711000002' }])
  })

  it('normalises bare BD numbers beginning with 01', () => {
    const rows = parseContactsCsv('phone\n01711000001\n')
    expect(rows[0].e164).toBe('+8801711000001')
  })

  it('treats extra columns as attrs', () => {
    const rows = parseContactsCsv('phone,name,city\n+8801711000001,Kabir,Dhaka')
    expect(rows[0]).toEqual({
      e164: '+8801711000001',
      name: 'Kabir',
      attrs: { city: 'Dhaka' },
    })
  })

  it('parses tags as comma- or pipe-separated', () => {
    const rows = parseContactsCsv('phone,tags\n+8801711000001,"vip|hot-lead"')
    expect(rows[0].tags).toEqual(['vip', 'hot-lead'])
  })

  it('accepts a headerless file by treating column 1 as phone', () => {
    const rows = parseContactsCsv('+8801711000001\n+8801711000002')
    expect(rows.map((r) => r.e164)).toEqual(['+8801711000001', '+8801711000002'])
  })

  it('discards invalid phone rows', () => {
    const rows = parseContactsCsv('phone\nnot-a-phone\n+8801711000001')
    expect(rows.map((r) => r.e164)).toEqual(['+8801711000001'])
  })

  it('accepts a valid locale only', () => {
    const rows = parseContactsCsv('phone,locale\n+8801711000001,bn\n+8801711000002,garbage')
    expect(rows[0].locale).toBe('bn')
    expect(rows[1].locale).toBeUndefined()
  })
})
