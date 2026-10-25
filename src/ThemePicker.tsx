import { themes, type ThemeId } from '../shared/themes';
export function ThemePicker({ value, onChange }: { value: ThemeId; onChange: (value: ThemeId) => void }) {
  return <fieldset className="theme-picker"><legend>Page theme</legend><p>Choose the colours everyone will see.</p><div className="theme-grid">{themes.map(theme => <label key={theme.id} className="theme-choice" data-theme={theme.id}>
    <input type="radio" name="theme" aria-label={theme.name} value={theme.id} checked={value === theme.id} onChange={() => onChange(theme.id)}/>
    <span><span className="theme-swatch" aria-hidden="true"><i/><i/><i/></span><strong>{theme.name}</strong><small>{theme.description}</small></span>
  </label>)}</div></fieldset>;
}
