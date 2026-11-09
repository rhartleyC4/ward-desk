// Removes what one `--apply` run of the sheets import added.
//
// An import is one transaction, so every row it adds has the same created_at, down to the
// microsecond. That timestamp is the run id. prayer_roll has no created_at, so the import gives
// those rows an id worked out from the run id and the name, and undo finds them the same way.
//
// The output is counts only, like the import's.

import type postgres from 'postgres'

type Tx = postgres.TransactionSql

export type UndoResult = {
  meetings: number
  programItems: number
  absences: number
  agendas: number
  agendaItems: number
  callings: number
  candidates: number
  prayerRoll: number
  /** Rows of this run that people have added to or changed since, as far as the columns can tell. */
  changedSince: number
  /** Requests, calling requests and appointments that point at this run's rows and will lose the link. */
  linksCleared: number
}

export function isRunId(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) && !Number.isNaN(Date.parse(value))
}

/** The id of the current transaction's run: its now(), which is every row's created_at. */
export async function startRun(tx: Tx): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as id`
  return row.id
}

export async function insertPrayerName(tx: Tx, runId: string, name: string): Promise<void> {
  await tx`
    insert into public.prayer_roll (id, name)
    values (md5(${runId}::text || '|' || lower(${name}::text))::uuid, ${name})`
}

class Preview extends Error {}

/** Deletes the run's rows in one transaction, and rolls it back unless `apply` is set. */
export async function undoImport(sql: postgres.Sql, runId: string, apply: boolean): Promise<UndoResult> {
  let result: UndoResult | undefined
  try {
    await sql.begin(async (tx) => {
      const [before] = await tx<{ program_items: number; candidates: number; changed_since: number; links_cleared: number }[]>`
        with run as (select ${runId}::timestamptz as at)
        select
          (select count(*) from public.program_items p
            join public.meetings m on m.id = p.meeting_id, run where m.created_at = run.at)::int as program_items,
          (select count(*) from public.calling_candidates c
            join public.calling_needs n on n.id = c.need_id, run where n.created_at = run.at)::int as candidates,
          (
            (select count(*) from public.meetings m, run where m.created_at = run.at and m.updated_at > run.at)
            + (select count(*) from public.program_items p
                join public.meetings m on m.id = p.meeting_id, run where m.created_at = run.at and p.created_at <> run.at)
            + (select count(*) from public.agenda_items i, run where i.created_at = run.at and i.resolved_on is not null)
            + (select count(*) from public.calling_needs n, run where n.created_at = run.at and n.updated_at > run.at)
            + (select count(*) from public.calling_candidates c
                join public.calling_needs n on n.id = c.need_id, run
                where n.created_at = run.at and (c.created_at <> run.at or c.updated_at > run.at))
          )::int as changed_since,
          (
            (select count(*) from public.requests r
              join public.agenda_items i on i.id = r.agenda_item_id, run where i.created_at = run.at)
            + (select count(*) from public.calling_requests r
                join public.calling_needs n on n.id = r.need_id, run where n.created_at = run.at)
            + (select count(*) from public.interviews v
                join public.calling_candidates c on c.id = v.candidate_id
                join public.calling_needs n on n.id = c.need_id, run where n.created_at = run.at)
          )::int as links_cleared`

      // Program items and candidates go with their meeting and calling.
      const meetings = await tx`delete from public.meetings where created_at = ${runId}::timestamptz`
      const absences = await tx`delete from public.absences where created_at = ${runId}::timestamptz`
      const agendaItems = await tx`delete from public.agenda_items where created_at = ${runId}::timestamptz`
      const agendas = await tx`delete from public.agendas where created_at = ${runId}::timestamptz`
      const callings = await tx`delete from public.calling_needs where created_at = ${runId}::timestamptz`
      const prayerRoll = await tx`
        delete from public.prayer_roll where id = md5(${runId}::text || '|' || lower(name))::uuid`

      result = {
        meetings: meetings.count,
        programItems: before.program_items,
        absences: absences.count,
        agendas: agendas.count,
        agendaItems: agendaItems.count,
        callings: callings.count,
        candidates: before.candidates,
        prayerRoll: prayerRoll.count,
        changedSince: before.changed_since,
        linksCleared: before.links_cleared,
      }
      if (!apply) throw new Preview()
    })
  } catch (err) {
    if (!(err instanceof Preview)) throw err
  }
  return result!
}

export function undoTotal(r: UndoResult): number {
  return r.meetings + r.programItems + r.absences + r.agendas + r.agendaItems + r.callings + r.candidates + r.prayerRoll
}

export function undoReport(r: UndoResult, apply: boolean): string[] {
  const lines = [
    apply ? 'Removed:' : 'Dry run: nothing was removed. Add --apply to remove:',
    `  ${r.meetings} sacrament meetings (${r.programItems} program items)`,
    `  ${r.absences} trips`,
    `  ${r.agendas} agendas, ${r.agendaItems} agenda items`,
    `  ${r.callings} callings (${r.candidates} names)`,
    `  ${r.prayerRoll} prayer roll names`,
  ]
  if (r.changedSince) lines.push(`${r.changedSince} of these rows were added to or changed in the app after the import, and go too.`)
  if (r.linksCleared) lines.push(`${r.linksCleared} requests or appointments point at these rows. They stay, without the link.`)
  lines.push('Prayers or thoughts the import filled in on agendas that already existed stay as they are.')
  return lines
}
