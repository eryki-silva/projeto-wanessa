import {Check,RotateCcw} from 'lucide-react';
import type {JourneyInput} from '../../shared/contracts';
import {weekdayNames,workingDays} from '../../shared/working-days';

export function WorkingDayPicker({input,onChange}:{input:JourneyInput;onChange:(input:JourneyInput)=>void}){
 const selected=workingDays(input),count=selected.filter(Boolean).length;
 return <div className="working-day-picker"><div className="day-picker-heading"><div><h3>Escolha os dias da sua semana</h3><p>Toque em cada dia para alternar entre trabalho e folga.</p></div><button className="button" onClick={()=>onChange({...input,workingDays:undefined})}><RotateCcw size={12}/>Restaurar dias</button></div><div className="day-picker-grid" role="group" aria-label="Dias de trabalho e folga">{weekdayNames.map((name,i)=><button key={name} type="button" className={'day-choice '+(selected[i]?'is-working':'is-off')} aria-label={`${name}: ${selected[i]?'trabalho':'folga'}`} aria-pressed={selected[i]} onClick={()=>onChange({...input,workingDays:selected.map((v,j)=>i===j?!v:v)})}><span>{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][i]}</span><strong>{selected[i]?<><Check size={12}/>Trabalho</>:'Folga'}</strong></button>)}</div><div className="day-picker-count" aria-live="polite">{count} dias de trabalho · {7-count} de folga</div></div>;
}
