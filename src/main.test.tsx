import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const root = { render: vi.fn() }
  return { root, createRoot: vi.fn(() => root), startReporting: vi.fn(), keepUpToDate: vi.fn(), reportClientError: vi.fn() }
})

vi.mock('react-dom/client', () => ({ createRoot: mocks.createRoot }))
vi.mock('./App.tsx', () => ({ default: () => null }))
vi.mock('./lib/supabase', () => ({ supabase: { client: true } }))
vi.mock('./lib/queries', () => ({ reportClientError: mocks.reportClientError }))
vi.mock('./lib/errorReport', () => ({ startReporting: mocks.startReporting }))
vi.mock('./lib/appUpdate', () => ({ keepUpToDate: mocks.keepUpToDate }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  document.body.innerHTML = '<div id="root"></div>'
})

describe('starting the app', () => {
  it('renders into the root, keeps itself up to date, and reports errors to the database', async () => {
    await import('./main')
    expect(mocks.createRoot).toHaveBeenCalledWith(document.getElementById('root'))
    expect(mocks.root.render).toHaveBeenCalledOnce()
    expect(mocks.keepUpToDate).toHaveBeenCalledOnce()

    const report = { message: 'm' }
    mocks.startReporting.mock.calls[0][0](report)
    expect(mocks.reportClientError).toHaveBeenCalledWith({ client: true }, report)
  })
})
