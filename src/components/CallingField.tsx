import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import { COMMON_CALLINGS, type CommonCalling } from '../lib/callings'

/**
 * A calling title box that suggests common ward callings as the user types, while still taking any
 * title they enter.
 */
export function CallingField({ value, onChange, required }: { value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <Autocomplete<CommonCalling, false, false, true>
      freeSolo
      options={COMMON_CALLINGS}
      groupBy={(option) => option.group}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.title)}
      // Controlling the selection too keeps it in step when the form clears the text.
      value={value || null}
      onChange={(_, next) => onChange(typeof next === 'string' ? next : (next?.title ?? ''))}
      inputValue={value}
      onInputChange={(_, next) => onChange(next)}
      renderInput={(params) => <TextField {...params} label="Calling" required={required} />}
    />
  )
}
