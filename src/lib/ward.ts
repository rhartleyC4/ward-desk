/**
 * The ward's name, shown in the header and used as the installed app's name. It comes from
 * VITE_WARD_NAME at build time (WARD_NAME on GitHub; asked for by npm run setup and env:github).
 */
export const WARD_NAME: string = import.meta.env.VITE_WARD_NAME?.trim() || 'Ward Desk'
