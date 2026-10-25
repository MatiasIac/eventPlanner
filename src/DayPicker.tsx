import { dayDate } from '../shared/model';
export function DayPicker({ value, onChange, date }: { value: number; onChange: (day: number) => void; date: string | null }) {
  return <div className="day-picker">
    <div className="field"><label htmlFor="activity_day">When</label><select id="activity_day" value={value < 0 ? 'before' : value > 0 ? 'after' : 'wedding'} onChange={e => onChange(e.target.value === 'before' ? -Math.max(1,Math.abs(value)) : e.target.value === 'after' ? Math.max(1,Math.abs(value)) : 0)}><option value="before">Before the main day</option><option value="wedding">Main day</option><option value="after">After the main day</option></select></div>
    {value !== 0 && <div className="field"><label htmlFor="days_away">Days {value < 0 ? 'before' : 'after'}</label><input id="days_away" type="number" min={1} max={365} required value={Math.abs(value)} onChange={e => onChange((value < 0 ? -1 : 1) * Math.max(1, Number(e.target.value)))}/></div>}
    {date && <small className="chosen-date">{dayDate(date,value)}</small>}
  </div>;
}
