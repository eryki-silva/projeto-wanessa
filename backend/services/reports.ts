import ExcelJS from 'exceljs';
import type {JourneyInput} from '../../shared/contracts.js';
import {calculate} from '../domain/journey.js';
const time=(n:number)=>`${Math.floor(Math.round(n)/60)}:${String(Math.round(n)%60).padStart(2,'0')}`;
export async function createReport(input:JourneyInput,format:'xlsx'|'csv'){
 const r=calculate(input),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Jornada semanal');
 sheet.addRow(['Dia','Entrada','Intervalo','Retorno','Saída','Diurnas','Noturnas','Total']);
 r.days.forEach(d=>sheet.addRow([d.label,...(d.working?[input.start,input.breakStart,input.breakEnd,input.end]:['Folga','Folga','Folga','Folga']),time(d.daytime),time(d.nighttime),time(d.calculated)]));
 sheet.addRow(['Total da semana','','','','',time(r.totals.daytime),time(r.totals.nighttime),time(r.totals.calculated)]);
 sheet.columns.forEach((c,i)=>c.width=i===0?24:18);sheet.views=[{state:'frozen',ySplit:1}];
 for(const index of [1,9]){sheet.getRow(index).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(index).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF24594D'}};}
 sheet.eachRow(row=>row.eachCell((cell,column)=>{if(column===7&&row.number!==1&&row.number!==9)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8E9ED'}};}));
 if(format==='xlsx')return Buffer.from(await book.xlsx.writeBuffer());
 sheet.eachRow(row=>row.eachCell(cell=>{if(typeof cell.value==='string'&&/^[=+@-]/.test(cell.value))cell.value="'"+cell.value;}));
 return Buffer.concat([Buffer.from('\ufeff'),Buffer.from(await book.csv.writeBuffer())]);
}
