import type {JourneyInput,JourneyResult,MonthResult,Pattern,Person,MonthlyRequest} from '../../shared/contracts';
async function request<T>(path:string,body:unknown,signal?:AbortSignal):Promise<T>{
 const res=await fetch('/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 if(!res.ok){const error=await res.json();throw Error(error.message||'Não foi possível concluir a solicitação.');}return res.json();
}
export const api={calculate:(input:JourneyInput,signal?:AbortSignal)=>request<JourneyResult>('/journeys/calculate',input,signal),generate:(month:string,pattern:Pattern,people:Person[])=>request<MonthResult>('/schedules/generate',{month,pattern,people}),monthly:(payload:MonthlyRequest,signal?:AbortSignal)=>request<MonthResult>('/schedules/monthly',payload,signal)};
export async function downloadMonthly(payload:MonthlyRequest,format:'xlsx'|'csv'){
 const res=await fetch('/api/reports/monthly',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,format})});if(!res.ok)throw Error('Não foi possível exportar a escala.');const url=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=url;a.download=`escala-${payload.month}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function downloadWeekly(input:JourneyInput,format:'xlsx'|'csv'){
 const res=await fetch('/api/reports/weekly',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input,format})});
 if(!res.ok)throw Error('Não foi possível gerar o relatório.');const url=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=url;a.download=`jornada-semanal.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
