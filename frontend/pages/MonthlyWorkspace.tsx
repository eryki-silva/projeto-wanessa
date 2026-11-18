import {useState,type ComponentProps} from 'react';
import {CalendarDays,Layers3} from 'lucide-react';
import type {PlannerDraft} from '../../shared/planner';
import {MonthlyPage} from './MonthlyPage';
import {PeriodPlannerPage} from './PeriodPlannerPage';

export function MonthlyWorkspace({draft,onDraftChange,...monthly}:ComponentProps<typeof MonthlyPage>&{draft?:PlannerDraft;onDraftChange:(draft:PlannerDraft)=>void}){
  const [mode,setMode]=useState<'period'|'month'>('period');
  return <><div className="monthly-mode-tabs"><button className={mode==='period'?'active':''} onClick={()=>setMode('period')}><Layers3 size={15}/>Período e rodízio<span>NOVO · LOCAL</span></button><button className={mode==='month'?'active':''} onClick={()=>setMode('month')}><CalendarDays size={15}/>Escala mensal simples</button></div>{mode==='period'?<PeriodPlannerPage draft={draft} people={monthly.people} saveDraft={onDraftChange}/>:<MonthlyPage {...monthly}/>}</>;
}
