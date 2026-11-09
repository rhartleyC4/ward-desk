import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs without types
import { hostedSettings, tomlString } from './hosted-config.mjs'

const config = `
[auth]
site_url = "http://localhost:5173"

# site_url = "https://commented.example.org"
[remotes.staging.auth]
site_url = "https://training.example.org"

[remotes.staging.auth.email.smtp]
admin_email = "training@example.org"

[remotes.production.auth]
enable_signup = false
site_url = "https://ward.example.org" # the real site

[remotes.production.auth.email.smtp]
admin_email = "ward@example.org"
`

describe('hosted config', () => {
  it('reads each environment from its own block', () => {
    expect(hostedSettings(config, 'staging')).toEqual({ url: 'https://training.example.org', sender: 'training@example.org' })
    expect(hostedSettings(config, 'production')).toEqual({ url: 'https://ward.example.org', sender: 'ward@example.org' })
  })

  it('does not fall through to a key in another table', () => {
    expect(tomlString(config, 'remotes.production.auth', 'admin_email')).toBeUndefined()
    expect(hostedSettings(config, 'riverside')).toEqual({ url: undefined, sender: undefined })
  })
})
