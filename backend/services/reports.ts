import ExcelJS from 'exceljs';
import type {JourneyInput} from '../../shared/contracts.js';
import {calculate} from '../domain/journey.js';
import {twelveByThirtySixNote} from '../../shared/journey-notes.js';

const dayFraction=(minutes:number)=>minutes/1440;
const clockValue=(value:string)=>{const [h,m]=value.split(':').map(Number);return(h*60+m)/1440;};
const display=(minutes:number)=>`${Math.floor(Math.round(minutes)/60)}:${String(Math.round(minutes)%60).padStart(2,'0')}`;

export async function createReport(input:JourneyInput,format:'xlsx'|'csv'){
 const result=calculate(input);
 if(format==='csv'){
  const rows:unknown[][]=[['Dia','Entrada','Intervalo','Retorno','Saída','Diurnas','Noturnas','Total'],...result.days.map((d,i)=>[d.label,...(d.working?Object.values(input.dailyTimes?.[i]??{start:input.start,breakStart:input.breakStart,breakEnd:input.breakEnd,end:input.end}):['Folga','Folga','Folga','Folga']),display(d.daytime),display(d.nighttime),display(d.calculated)]),['Total da semana','','','','',display(result.totals.daytime),display(result.totals.nighttime),display(result.totals.calculated)],...result.warnings.map(w=>['Conferência',w])];
  if(input.pattern==='12x36')rows.push(['Observação 12×36',twelveByThirtySixNote]);
  const quote=(v:unknown)=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
  return Buffer.from('\ufeff'+rows.map(row=>row.map(quote).join(';')).join('\r\n'));
 }
 const book=new ExcelJS.Workbook();
 book.creator='Compasso';
 book.calcProperties.fullCalcOnLoad=true;
 const sheet=book.addWorksheet('Jornada semanal');
 sheet.addRow(['Dia','Entrada','Intervalo','Retorno','Saída','Diurnas','Noturnas','Total','Entrada absoluta','Intervalo absoluto','Retorno absoluto','Saída absoluta','Tempo real','Noturno real']);
 sheet.columns.forEach((column,i)=>{column.width=i===0?26:18;if(i>=8)column.hidden=true;});
 sheet.views=[{state:'frozen',ySplit:1}];
 sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:'A1:H18'};
 sheet.getRow(1).height=26;

 const setFormula=(address:string,formula:string,value:number)=>{
  const cell=sheet.getCell(address);cell.value={formula,result:value};cell.numFmt='[h]:mm';
 };
 result.days.forEach((day,index)=>{
  const row=index+2;
  const shift=input.dailyTimes?.[index]??input;
  const times=[shift.start,shift.breakStart,shift.breakEnd,shift.end];
  sheet.addRow([day.label,...(day.working?times.map(clockValue):['Folga','Folga','Folga','Folga'])]);
  const cells=sheet.getRow(row);cells.height=25;
  for(let col=2;col<=5;col++){
   const cell=cells.getCell(col);cell.numFmt='hh:mm';cell.font={color:{argb:day.working?'FF2563EB':'FFAD4660'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:day.working?'FFEFF6FF':'FFFFEDF1'}};
   cell.note='Edite como horário, por exemplo 19:00. Preencha as quatro batidas para calcular o dia.';
  }
  const count=`COUNT(B${row}:E${row})=4`;
  let normalized=day.working?times.map(clockValue):[0,0,0,0];
  if(day.working)for(let i=1;i<4;i++)while(normalized[i]<normalized[i-1])normalized[i]+=1;
  setFormula(`I${row}`,`IF(${count},B${row},0)`,normalized[0]);
  setFormula(`J${row}`,`IF(${count},I${row}+MOD(C${row}-B${row},1),0)`,normalized[1]);
  setFormula(`K${row}`,`IF(${count},J${row}+MOD(D${row}-C${row},1),0)`,normalized[2]);
  setFormula(`L${row}`,`IF(${count},K${row}+MOD(E${row}-D${row},1),0)`,normalized[3]);
  setFormula(`M${row}`,`SUM(J${row}-I${row},L${row}-K${row})`,dayFraction(day.real));
  // Intersect each working interval with 22:00–05:00, including the early-morning band.
  const overlaps:string[]=[];
  for(const [a,b] of [[`I${row}`,`J${row}`],[`K${row}`,`L${row}`]])for(const offset of [-1,0,1]){
   overlaps.push(`MAX(0,MIN(${b},${offset+29/24})-MAX(${a},${offset+22/24}))`);
  }
  const rawNight=day.working?day.nighttime/(input.reducedNight?8/7:1):0;
  setFormula(`N${row}`,`SUM(${overlaps.join(',')})`,dayFraction(rawNight));
  const valid=`AND(${count},L${row}>I${row},L${row}-I${row}<1)`;
  setFormula(`F${row}`,`IF(${valid},MAX(0,M${row}-N${row}),0)`,dayFraction(day.daytime));
  setFormula(`G${row}`,`IF(${valid},N${row}*IF($B$12="Sim",8/7,1),0)`,dayFraction(day.nighttime));
  setFormula(`H${row}`,`SUM(F${row}:G${row})`,dayFraction(day.calculated));
  sheet.getCell(`G${row}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8E9ED'}};
 });
 sheet.getCell('A9').value='Total da semana';
 setFormula('F9','SUM(F2:F8)',dayFraction(result.totals.daytime));
 setFormula('G9','SUM(G2:G8)',dayFraction(result.totals.nighttime));
 setFormula('H9','SUM(H2:H8)',dayFraction(result.totals.calculated));
 for(const row of [1,9]){
  for(let col=1;col<=8;col++){
   const cell=sheet.getRow(row).getCell(col);cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF24594D'}};
  }
 }
 sheet.getCell('A11').value='Parâmetros do cálculo';sheet.getCell('A11').font={bold:true};
 sheet.getCell('A12').value='Hora noturna reduzida';sheet.getCell('B12').value=input.reducedNight?'Sim':'Não';
 sheet.getCell('B12').dataValidation={type:'list',allowBlank:false,formulae:['"Sim,Não"'],showErrorMessage:true,errorTitle:'Opção inválida',error:'Escolha Sim ou Não.'};
 sheet.getCell('B12').font={color:{argb:'FF2563EB'}};
 sheet.getCell('A13').value='Meta semanal';sheet.getCell('B13').value=input.target/24;sheet.getCell('B13').numFmt='[h]:mm';sheet.getCell('B13').font={color:{argb:'FF2563EB'}};
 sheet.getCell('A14').value='Tipo de escala';sheet.getCell('B14').value=input.pattern.replace('x','×');
 sheet.mergeCells('A16:H16');sheet.getCell('A16').value='Edite as batidas azuis (B a E). Diurnas, noturnas e totais são calculados por fórmulas. Folga não entra na soma; para trabalhar nesse dia, preencha as quatro batidas.';
 sheet.mergeCells('A17:H17');sheet.getCell('A17').value='A redução noturna considera somente 22h–5h, com intervalo descontado. Horários após a meia-noite são considerados no dia seguinte. Informe uma jornada menor que 24 horas.';
 for(const row of [16,17]){sheet.getRow(row).height=32;sheet.getCell(`A${row}`).alignment={wrapText:true,vertical:'middle'};sheet.getCell(`A${row}`).font={size:10,color:{argb:'FF667788'}};}
 if(input.pattern==='12x36'){
  sheet.mergeCells('A18:H18');
  const note=sheet.getCell('A18');note.value=twelveByThirtySixNote;
  note.alignment={wrapText:true,vertical:'middle'};note.font={size:10,color:{argb:'FF42687B'}};
  note.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF4F8'}};sheet.getRow(18).height=45;
 }
 result.warnings.forEach((warning,i)=>{const row=19+i;sheet.getCell(`A${row}`).value='Conferência';sheet.mergeCells(`B${row}:H${row}`);sheet.getCell(`B${row}`).value=warning;sheet.getCell(`B${row}`).alignment={wrapText:true};sheet.getRow(row).height=30;});
 if(result.warnings.length)sheet.pageSetup.printArea=`A1:H${18+result.warnings.length}`;
 return Buffer.from(await book.xlsx.writeBuffer());
}
