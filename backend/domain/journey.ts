import {z} from 'zod';
import type {JourneyInput,JourneyResult,MonthResult,Person} from '../../shared/contracts.js';
import {weekdayNames,workingDays} from '../../shared/working-days.js';
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,'Horário inválido.');
export const journeySchema=z.object({start:time,breakStart:time,breakEnd:time,end:time,pattern:z.enum(['5x2','6x1','12x36']),reducedNight:z.boolean(),target:z.number().positive().max(168),workingDays:z.array(z.boolean()).length(7).optional()}).strict();
export function calculate(input:JourneyInput):JourneyResult {
 const p=journeySchema.parse(input);
 const stamps=[p.start,p.breakStart,p.breakEnd,p.end].map(t=>{const [h,m]=t.split(':').map(Number);return h*60+m;});
 for(let i=1;i<4;i++)while(stamps[i]<stamps[i-1])stamps[i]+=1440;
 if(stamps[3]-stamps[0]>=1440||stamps[3]===stamps[0])throw Error('A jornada deve durar mais de zero e menos de 24 horas.');
 let real=0,night=0;
 for(const [a,b] of [[stamps[0],stamps[1]],[stamps[2],stamps[3]]]){real+=b-a;for(let d=-1;d<=2;d++)night+=Math.max(0,Math.min(b,d*1440+1740)-Math.max(a,d*1440+1320));}
 if(real<=0)throw Error('Informe uma jornada com tempo de trabalho.');
 const daily={real,daytime:real-night,nighttime:night*(p.reducedNight?8/7:1),calculated:real+(p.reducedNight?night/7:0)};
 const selected=workingDays(p);
 const days=weekdayNames.map((label,i)=>{const working=selected[i];return{label,working,...Object.fromEntries(Object.entries(daily).map(([k,v])=>[k,working?v:0]))} as JourneyResult['days'][number];});
 const count=days.filter(d=>d.working).length;
 const cycleValid=p.pattern==='12x36'?selected.every((v,i)=>i===0||v!==selected[i-1]):count===(p.pattern==='5x2'?5:6);
 const warnings=cycleValid?[]:[p.pattern==='12x36'?'Para manter o ciclo 12×36, alterne um dia de trabalho e um de folga.':`Você marcou ${count} dias de trabalho e ${7-count} de folga. A escala ${p.pattern==='5x2'?'5×2 pede 5 dias de trabalho e 2 de folga':'6×1 pede 6 dias de trabalho e 1 de folga'}.`];
 return {days,daily,totals:{real:real*count,daytime:daily.daytime*count,nighttime:daily.nighttime*count,calculated:daily.calculated*count,workingDays:count,offDays:7-count,difference:daily.calculated*count-p.target*60},nextWeek:daily.calculated*(p.pattern==='12x36'&&cycleValid?7-count:count),average:daily.calculated*(p.pattern==='12x36'&&cycleValid?3.5:count),cycleValid,warnings};
}
export const monthSchema=z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),pattern:z.enum(['5x2','6x1','12x36']),people:z.array(z.object({id:z.string().min(1),name:z.string(),role:z.string(),initials:z.string(),color:z.string()})).max(100)});
export function generateMonth(month:string,pattern:JourneyInput['pattern'],people:Person[]):MonthResult {
 const [y,m]=month.split('-').map(Number);
 const dates=Array.from({length:new Date(y,m,0).getDate()},(_,i)=>({day:i+1,weekday:new Date(y,m-1,i+1).getDay()}));
 return{dates,rows:Object.fromEntries(people.map((p,pi)=>[p.id,dates.map(d=>pattern==='12x36'?(Math.floor(Date.UTC(y,m-1,d.day)/86400000)+pi)%2===0:pattern==='5x2'?d.weekday!==0&&d.weekday!==6:d.weekday!==0)]))};
}
