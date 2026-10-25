import { illustrations } from '../shared/model';
export const illustrationLabel = (name: string) => name === 'leaf' ? 'Leaf' : name[0].toUpperCase() + name.slice(1);
export function IconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <fieldset className="icon-picker"><legend>Icon</legend><div className="icon-grid">{illustrations.map(name => <label className="icon-choice" key={name} title={illustrationLabel(name)}>
    <input type="radio" name="illustration" aria-label={illustrationLabel(name)} value={name} checked={value === name} onChange={() => onChange(name)}/>
    <span><img src={`/illustrations/${name}.svg`} width={44} height={44} alt=""/><small>{illustrationLabel(name)}</small></span>
  </label>)}</div></fieldset>;
}
