// Reads a hosted copy's address and email sender from its [remotes.<env>] blocks in
// supabase/config.toml, so someone running their own copy changes them in that one file.

/** The quoted string `key` is set to in exactly `[table]`, or undefined. */
export function tomlString(config, table, key) {
  let current = null
  for (const line of config.split('\n')) {
    const header = line.match(/^\s*\[+([^\]]+)\]+/)
    if (header) {
      current = header[1].trim()
    } else if (current === table) {
      const [, name, value] = line.match(/^\s*([\w-]+)\s*=\s*"([^"]*)"/) ?? []
      if (name === key) return value
    }
  }
  return undefined
}

/** url: the site's address. sender: the address sign-in emails come from. */
export function hostedSettings(config, env) {
  return {
    url: tomlString(config, `remotes.${env}.auth`, 'site_url'),
    sender: tomlString(config, `remotes.${env}.auth.email.smtp`, 'admin_email'),
  }
}
