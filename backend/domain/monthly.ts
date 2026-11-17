import {z} from 'zod';
import {calculate,journeySchema} from './journey.js';
import type {MonthlyRequest,MonthResult,JourneyInput} from '../../shared/contracts.js';
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const monthlySchema=z.object({
 month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),input:journeySchema,
 people:z.array(z.object({id:z.string().min(1),name:z.string().min(1).max(120),role:z.string().max(120),initials:z.string().max(6),color:z.string().max(20),sex:z.enum(['F','M']).optional(),start:time.optional(),breakStart:time.optional(),breakEnd:time.optional(),end:time.optional(),off:z.number().int().min(1).max(6).optional(),limit:z.number().positive().max(168).optional()})).max(100),
 rules:z.object({minimum:z.number().int().min(0).max(100),maxDays:z.number().int().min(1).max(31),sunday:z.enum(['alternate','none']),holidays:z.array(z.number().int().min(1).max(31))}),
 previousRows:z.record(z.array(z.boolean()).max(31)).optional(),rows:z.record(z.array(z.boolean()).max(31)).optional()
}).superRefine((p,ctx)=>{if(new Set(p.people.map(x=>x.id)).size!==p.people.length)ctx.addIssue({code:'custom',message:'Colaboradores duplicados.'});});
function week(date:Date){const d=new Date(date);d.setDate(d.getDate()-(d.getDay()+6)%7);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;}
export function personJourney(p:MonthlyRequest['people'][number],input:JourneyInput){return {...input,start:p.start??input.start,breakStart:p.breakStart??input.breakStart,breakEnd:p.breakEnd??input.breakEnd,end:p.end??input.end};}
export function monthly(raw:MonthlyRequest):MonthResult {
 const p=monthlySchema.parse(raw),[year,month]=p.month.split('-').map(Number);
 const ds=Array.from({length:new Date(year,month,0).getDate()},(_,i)=>new Date(year,month-1,i+1));
 const holidays=new Set(p.rules.holidays),groups:Record<string,number[]>={};ds.forEach((d,i)=>(groups[week(d)]??=[]).push(i));const weeks=Object.values(groups),warnings:string[]=[],rows:Record<string,boolean[]>={};
 if(!p.previousRows)warnings.push('Sem histórico do mês anterior: confira a continuidade das jornadas e folgas na virada do mês.');
 warnings.push('A cobertura mínima considera pessoas por dia. Confira a cobertura de cada horário.');
 const daily=Object.fromEntries(p.people.map(person=>[person.id,calculate(personJourney(person,p.input)).daily]));
 if(p.rows){
  for(const person of p.people){const r=p.rows[person.id];if(!r||r.length!==ds.length)throw Error('A escala informada não corresponde ao mês ou aos colaboradores.');rows[person.id]=r.map((v,i)=>!holidays.has(i+1)&&v);}
 }else{
  for(const [pi,person] of p.people.entries()){
   rows[person.id]=ds.map((d,i)=>{
    if(holidays.has(i+1))return false;
    if(p.input.pattern==='12x36')return(Math.floor(Date.UTC(year,month-1,i+1)/86400000)+pi)%2===0;
    if(d.getDay()===0&&person.sex==='F'&&p.rules.sunday==='alternate')return Math.round((Date.UTC(year,month-1,i+1)-Date.UTC(2024,0,7))/604800000)%2!==pi%2;
    return true;
   });
  }
  const loads=ds.map((_,i)=>p.people.filter(person=>rows[person.id][i]).length);
  p.people.forEach((person,pi)=>{
   const r=rows[person.id];
   if(p.input.pattern!=='12x36')for(const indexes of weeks){
    const off=person.off??(p.input.pattern==='5x2'?2:1),target=Math.round(indexes.length*off/7);let current=indexes.filter(i=>!r[i]).length;
    while(current<target){const choices=indexes.filter(i=>r[i]).sort((a,b)=>(loads[b]-loads[a])||((a+pi*2)%7-(b+pi*2)%7));if(!choices.length)break;const i=choices[0];r[i]=false;loads[i]--;current++;}
   }
   let run=0;const prev=p.previousRows?.[person.id]??[];for(let i=prev.length-1;i>=0&&prev[i];i--)run++;
   r.forEach((work,i)=>{run=work?run+1:0;if(run>p.rules.maxDays){r[i]=false;loads[i]--;run=0;}});
  });
 }
 const summaries=p.people.map(person=>{
  const r=rows[person.id],h=daily[person.id],worked=r.filter(Boolean).length,weekly=weeks.map(ix=>ix.filter(i=>r[i]).length*h.calculated),limit=person.limit??p.input.target;
  weekly.forEach((total,wi)=>{if(total>limit*60+.01)warnings.push(`${person.name}: ${Math.round(total/60*100)/100}h na semana ${wi+1}; limite de ${limit}h.`);});
  const journey=personJourney(person,p.input),minute=(t:string)=>{const[h,m]=t.split(':').map(Number);return h*60+m;};
  let run=0;const prev=p.previousRows?.[person.id]??[];for(let i=prev.length-1;i>=0&&prev[i];i--)run++;
  let lastSunday:boolean|undefined;if(prev.length){const previousDates=Array.from({length:prev.length},(_,i)=>new Date(year,month-2,i+1));for(let i=previousDates.length-1;i>=0;i--)if(previousDates[i].getDay()===0){lastSunday=prev[i];break;}}
  r.forEach((work,i)=>{run=work?run+1:0;if(run>p.rules.maxDays)warnings.push(`${person.name}: mais de ${p.rules.maxDays} dias seguidos em ${i+1}.`);if(work&&(i>0?r[i-1]:prev.at(-1))){const rest=minute(journey.start)+1440-(minute(journey.end)+(minute(journey.end)<=minute(journey.start)?1440:0));if(rest<660)warnings.push(`${person.name}: intervalo entre jornadas inferior a 11h no dia ${i+1}.`);}if(ds[i].getDay()===0){if(person.sex==='F'&&p.rules.sunday==='alternate'&&work&&lastSunday)warnings.push(`${person.name}: domingos consecutivos de trabalho no dia ${i+1}.`);lastSunday=work;}});
  if(p.input.pattern!=='12x36')weeks.forEach((ix,wi)=>{if(ix.length===7&&ix.filter(i=>!r[i]).length!==(person.off??(p.input.pattern==='5x2'?2:1)))warnings.push(`${person.name}: confira a quantidade de folgas na semana ${wi+1}.`);});
  return{id:person.id,name:person.name,real:worked*h.real,nighttime:worked*h.nighttime,calculated:worked*h.calculated,workingDays:worked,weekly};
 });
 ds.forEach((_,i)=>{if(holidays.has(i+1))return;const present=p.people.filter(person=>rows[person.id][i]).length;if(present<p.rules.minimum)warnings.push(`Dia ${i+1}: ${present} pessoas previstas; mínimo de ${p.rules.minimum}.`);});
 if(p.input.pattern==='12x36')warnings.push('O ciclo alterna dias de trabalho e folga. Confira se as batidas correspondem ao plantão pretendido e ao descanso de 36 horas.');
 return{dates:ds.map((d,i)=>({day:i+1,weekday:d.getDay()})),rows,warnings,summaries,weeks:weeks.map(ix=>({start:ix[0]+1,end:ix.at(-1)!+1}))};
}
