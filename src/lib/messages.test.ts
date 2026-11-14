import { describe, expect, it } from 'vitest'
import { addressName, addressOptions, audienceFor, emailLink, emailSubject, fillTemplate, firstName, missingAssignments, insertAt, usesVariable, lengthWords, smsLink, templatesFor, unknownVariables, type MessageTemplate } from './messages'

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

describe('addressName', () => {
  it('uses the first name, or Sister or Brother with the last name', () => {
    expect(addressName('Mary Reyes')).toBe('Mary')
    expect(addressName('Mary Reyes', 'sister')).toBe('Sister Reyes')
    expect(addressName(' Jordan  Lee  Pike ', 'brother')).toBe('Brother Pike')
  })

  it('keeps a title that was entered with the name', () => {
    expect(addressName('Sister Nash', 'brother')).toBe('Sister Nash')
    expect(addressName('', 'sister')).toBe('')
  })
})

describe('addressOptions', () => {
  it('offers each way to address someone, labelled with how it reads', () => {
    expect(addressOptions('Mary Reyes').map((o) => o.label)).toEqual(['Mary', 'Sister Reyes', 'Brother Reyes'])
  })

  it('offers nothing when the title is already entered or there is no name', () => {
    expect(addressOptions('Brother Hale')).toEqual([])
    expect(addressOptions('  ')).toEqual([])
  })
})

describe('usesVariable', () => {
  it('finds a variable in a template', () => {
    expect(usesVariable('Hi {first_name}', 'first_name')).toBe(true)
    expect(usesVariable('Hi {name}', 'first_name')).toBe(false)
  })
})

describe('insertAt', () => {
  it('puts a variable at the cursor or over the selection', () => {
    expect(insertAt('Hi ,', 3, 3, '{first_name}')).toEqual({ body: 'Hi {first_name},', cursor: 15 })
    expect(insertAt('Hi you,', 3, 6, '{name}')).toEqual({ body: 'Hi {name},', cursor: 9 })
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

  it('addresses the person as picked', () => {
    expect(fillTemplate('Hi {first_name}', { name: 'Mary Reyes', leader: '', minutes: 5, myName: '', address: 'sister' })).toBe('Hi Sister Reyes')
  })

  it('fills a reminder with the time booked', () => {
    expect(fillTemplate('{name}: {time} with {leader}', { name: 'Sister Nash', leader: 'Brother Lane', minutes: 5, myName: 'Q', time: 'Sun, November 8th at 9 AM' })).toBe(
      'Sister Nash: Sun, November 8th at 9 AM with Brother Lane',
    )
  })

  it('words things for one time or several', () => {
    const body = 'Would {this time|one of these times} work?\n{times}'
    const base = { name: 'Jordan', leader: 'Bishop Avery', minutes: 10, myName: '' }
    expect(fillTemplate(body, { ...base, times: ['Sun, November 8th at 9 AM'] })).toBe('Would this time work?\nSun, November 8th at 9 AM')
    expect(fillTemplate(body, { ...base, times: ['Sun at 9 AM', 'Wed at 7 PM'] })).toBe('Would one of these times work?\n• Sun at 9 AM\n• Wed at 7 PM')
    // A reminder is about one time; either side may be empty.
    expect(fillTemplate('See you{| all} on {time}.', { ...base, time: 'Sun at 9 AM' })).toBe('See you on Sun at 9 AM.')
    expect(unknownVariables(body)).toEqual([])
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
    const all = [t('o', 'offer', 'member'), t('op', 'offer', 'parent'), t('rp', 'reminder', 'parent')]
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
    expect(unknownVariables('Hi {frist_name} {frist_name} at {wehn}')).toEqual(['frist_name', 'wehn'])
  })
})

describe('smsLink', () => {
  it('opens a new message with the text and no recipient', () => {
    expect(smsLink('Hi Jordan,\n• 9 AM & 10 AM')).toBe('sms:?&body=Hi%20Jordan%2C%0A%E2%80%A2%209%20AM%20%26%2010%20AM')
  })
})

describe('emailLink', () => {
  it('opens a new email with the subject and text, CRLF line breaks and no recipient', () => {
    expect(emailLink('Appointment with Bishop Avery', 'Hi Jordan,\n• 9 AM & 10 AM')).toBe(
      'mailto:?subject=Appointment%20with%20Bishop%20Avery&body=Hi%20Jordan%2C%0D%0A%E2%80%A2%209%20AM%20%26%2010%20AM',
    )
    expect(emailLink('A', 'one\r\ntwo')).toBe('mailto:?subject=A&body=one%0D%0Atwo')
  })
})

describe('emailSubject', () => {
  it('names the leader but not the purpose', () => {
    expect(emailSubject('Bishop Avery')).toBe('Appointment with Bishop Avery')
    expect(emailSubject(' ')).toBe('Appointment')
  })
})

describe('meeting assignments', () => {
  const base = { name: '', leader: '', minutes: 0, myName: 'Brother Quinn', meeting: 'Ward Council', when: 'Sunday, November 8th at 9:15 AM' }
  const GROUP = 'Hi all, {meeting} is tomorrow, {when}.\n{assignments}\nSee you there. {my_name}'

  it('lists who has each assignment, one per line', () => {
    const text = fillTemplate(GROUP, { ...base, assignments: { openingPrayer: 'Brother Ortiz', closingPrayer: ' Sister Young ' } })
    expect(text).toBe('Hi all, Ward Council is tomorrow, Sunday, November 8th at 9:15 AM.\nOpening prayer: Brother Ortiz\nClosing prayer: Sister Young\nSee you there. Brother Quinn')
  })

  it('drops the line when no one is down yet', () => {
    expect(fillTemplate(GROUP, { ...base, assignments: {} })).toBe('Hi all, Ward Council is tomorrow, Sunday, November 8th at 9:15 AM.\nSee you there. Brother Quinn')
  })

  it('addresses the person with an assignment, and marks one no one has', () => {
    const body = 'Hi {opening_prayer}, you have the opening prayer at {meeting}. {spiritual_thought} has the thought.'
    expect(fillTemplate(body, { ...base, assignments: { openingPrayer: 'Brother Ortiz' } })).toBe('Hi Brother Ortiz, you have the opening prayer at Ward Council. (not assigned yet) has the thought.')
  })

  it('says which assignments a template needs that no one has', () => {
    expect(missingAssignments(GROUP, { openingPrayer: 'Brother Ortiz' })).toEqual(['Spiritual thought', 'Closing prayer'])
    expect(missingAssignments('Hi {opening_prayer}', { openingPrayer: 'Brother Ortiz' })).toEqual([])
    expect(missingAssignments('Hi {closing_prayer}', {})).toEqual(['Closing prayer'])
    expect(missingAssignments('Hi all', {})).toEqual([])
  })
})
