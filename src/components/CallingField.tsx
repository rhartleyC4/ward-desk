import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import { useMemo, type Ref } from 'react'
import { groupOf, sortCallings, type ListedCalling } from '../lib/callings'

/**
 * A calling title box that suggests titles from the ward's calling list as the user types, while
 * still taking any title they enter.
 */
export function CallingField({ value, onChange, callings, required, inputRef }: { value: string; onChange: (value: string) => void; callings: ListedCalling[]; required?: boolean; inputRef?: Ref<HTMLInputElement> }) {
  const options = useMemo(() => sortCallings(callings), [callings])
  return (
    <Autocomplete<ListedCalling, false, false, true>
      freeSolo
      options={options}
      groupBy={groupOf}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.title)}
      // Controlling the selection too keeps it in step when the form clears the text.
      value={value || null}
      onChange={(_, next) => onChange(typeof next === 'string' ? next : (next?.title ?? ''))}
      inputValue={value}
      onInputChange={(_, next) => onChange(next)}
      renderInput={(params) => <TextField {...params} label="Calling" required={required} inputRef={inputRef} />}
    />
  )
}
