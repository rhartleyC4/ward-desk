import { describe, expect, it } from 'vitest'
import { audienceFor, fillTemplate, firstName, lengthWords, smsLink, templatesFor, unknownVariables, type MessageTemplate } from './messages'

const OFFER = 'Hi {first_name}, {leader} would like to meet with you for about {length}. Would one of these times work?\n{times}\nThanks, {my_name}'

describe('firstName', () => {
  it('takes the first name, but keeps a title with the surname', () => {
    expect(firstName('Jordan Pike')).toBe('Jordan')
    expect(firstName('  Avery  ')).toBe('Avery')
    expect(firstName('Sister Nash')).toBe('Sister Nash')
    expect(firstName('bro. Vale')).toBe('bro. Vale')
    expect(firstName('')).toBe('')
  })
})

describe('lengthWords', () => {
  it('reads the length for a message', () => {
    expect(lengthWords(5)).toBe('5 minutes')
    expect(lengthWords(60)).toBe('1 hour')
    expect(lengthWords(75)).toBe('1 hour 15 minutes')
    expect(lengthWords(120)).toBe('2 hours')
  })
})

describe('fillTemplate', () => {
  it('fills an offer with the times picked, one per line', () => {
    const text = fillTemplate(OFFER, {
      name: 'Jordan Pike',
      leader: 'Bishop Avery',
      minutes: 10,
      myName: 'Brother Quinn',
      times: ['Sun, November 8th at 9:10 AM', 'Wed, November 11th at 7 PM'],
    })
    expect(text).toBe(
      'Hi Jordan, Bishop Avery would like to meet with you for about 10 minutes. Would one of these times work?\n• Sun, November 8th at 9:10 AM\n• Wed, November 11th at 7 PM\nThanks, Brother Quinn',
    )
  })

  it('fills a confirmation with the time booked', () => {
    expect(fillTemplate('{name}: {time} with {leader}', { name: 'Sister Nash', leader: 'Brother Lane', minutes: 5, myName: 'Q', time: 'Sun, November 8th at 9 AM' })).toBe(
      'Sister Nash: Sun, November 8th at 9 AM with Brother Lane',
    )
  })

  it('leaves unknown variables as typed', () => {
    expect(fillTemplate('Hi {frist_name}', { name: 'Jordan', leader: '', minutes: 10, myName: '' })).toBe('Hi {frist_name}')
  })
})

describe('messages to a parent', () => {
  it('greets the parent and names the youth', () => {
    const body = 'Hi {parent_name}, {leader} would like to meet with {first_name}.'
    expect(fillTemplate(body, { name: 'Avery Quinn', parentName: 'Sister Quinn', leader: 'Bishop Avery', minutes: 10, myName: '' })).toBe(
      'Hi Sister Quinn, Bishop Avery would like to meet with Avery.',
    )
    expect(fillTemplate(body, { name: 'Avery Quinn', parentName: '  ', leader: 'Bishop Avery', minutes: 10, myName: '' })).toBe('Hi there, Bishop Avery would like to meet with Avery.')
  })

  it('picks the parent templates for a youth', () => {
    const t = (id: string, kind: MessageTemplate['kind'], audience: MessageTemplate['audience']): MessageTemplate => ({ id, name: id, kind, audience, body: '' })
    const all = [t('o', 'offer', 'member'), t('op', 'offer', 'parent'), t('cp', 'confirm', 'parent')]
    expect(audienceFor({ is_youth: true })).toBe('parent')
    expect(audienceFor({ is_youth: false })).toBe('member')
    expect(templatesFor(all, 'offer', 'parent').map((x) => x.id)).toEqual(['op'])
    expect(templatesFor(all, 'offer', 'member').map((x) => x.id)).toEqual(['o'])
  })
})

describe('unknownVariables', () => {
  it('finds typos once each', () => {
    expect(unknownVariables(OFFER)).toEqual([])
    expect(unknownVariables('Hi {parent_name}')).toEqual([])
    expect(unknownVariables('Hi {frist_name} {frist_name} at {when}')).toEqual(['frist_name', 'when'])
  })
})

describe('smsLink', () => {
  it('opens a new message with the text and no recipient', () => {
    expect(smsLink('Hi Jordan,\n• 9 AM & 10 AM')).toBe('sms:?&body=Hi%20Jordan%2C%0A%E2%80%A2%209%20AM%20%26%2010%20AM')
  })
})
