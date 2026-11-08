/** True on the training site (demo.warddesk.app), which holds invented practice data only. */
export const isTrainingSite = () => import.meta.env.VITE_APP_ENV === 'staging'
