// The app's "today": the ward's date, whatever the device's clock says. Meetings, appointments and
// every other date here belong to the ward, so a leader travelling (or a fork in another zone) must
// count days the same way as everyone at home.

import type { IsoDate } from './dates'
import { wardParts } from './slots'
import { WARD_TIME_ZONE } from './supabase'

export const wardToday = (now: Date = new Date()): IsoDate => wardParts(now.toISOString(), WARD_TIME_ZONE).date
