import ExcelJS from 'exceljs';
import {monthly,personJourney} from '../domain/monthly';
import type {MonthlyRequest} from '../../shared/contracts';
const duration=(n:number)=>`${Math.floor(Math.round(n)/60)}:${String(Math.round(n)%60).padStart(2,'0')}`;
export async function createMonthlyReport(p:MonthlyRequest,format:'xlsx'|'csv'){
 const result=monthly(p),book=new ExcelJS.Workbook(),schedule=book.addWorksheet('Escala mensal');
 schedule.addRow(['Colaborador',...result.dates.map(d=>`${d.day}/${p.month.slice(5)}`),'Total real','Total calculado']);
 p.people.forEach(person=>{const shift=personJourney(person,p.input),s=result.summaries!.find(s=>s.id===person.id)!;schedule.addRow([person.name,...result.rows[person.id].map((v,i)=>p.rules.holidays.includes(i+1)?'Fechado':v?`${shift.start}-${shift.breakStart} / ${shift.breakEnd}-${shift.end}`:'Folga'),duration(s.real),duration(s.calculated)]);});
 const hours=book.addWorksheet('Horas por semana');hours.addRow(['Colaborador',...result.weeks!.map((w,i)=>`Sem. ${i+1} (${w.start}–${w.end})`),'Total calculado']);result.summaries!.forEach(s=>hours.addRow([s.name,...s.weekly.map(duration),duration(s.calculated)]));
 const notes=book.addWorksheet('Observações');notes.addRow(['Pontos para conferir']);result.warnings!.forEach(w=>notes.addRow([w]));
 for(const sheet of book.worksheets){sheet.views=[{state:'frozen',ySplit:1,xSplit:1}];sheet.columns.forEach((col,i)=>col.width=sheet===notes?100:i===0?25:20);sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF123E49'}};sheet.eachRow((row,i)=>{if(i>1)row.eachCell(cell=>{if(cell.value==='Folga'){cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFBE0E6'}};cell.font={color:{argb:'FF9C3450'}};}});});}
 if(format==='xlsx')return Buffer.from(await book.xlsx.writeBuffer());
 const quote=(v:unknown)=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';const lines:string[]=[];for(const sheet of book.worksheets){lines.push(quote(sheet.name));sheet.eachRow(row=>lines.push((row.values as unknown[]).slice(1).map(quote).join(';')));lines.push('');}return Buffer.from('\ufeff'+lines.join('\r\n'));
}
