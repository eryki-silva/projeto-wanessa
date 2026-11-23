import ExcelJS from 'exceljs';
import {planPeriod,plannerTeamHours} from '../domain/planner.js';
import {plannerWeekdays,type PlannerDraft} from '../../shared/planner.js';

const fraction=(minutes:number)=>minutes/1440;
const duration=(minutes:number)=>`${Math.floor(Math.round(minutes)/60)}:${String(Math.round(minutes)%60).padStart(2,'0')}`;
const excelText=(value:string)=>'"'+value.replace(/"/g,'""')+'"';

export async function createPlannerReport(draft:PlannerDraft,format:'xlsx'|'csv') {
  const result=planPeriod(draft),c=draft.config;
  const flexible=c.teams.some(t=>(t.coverTeamIds??[]).length>0);
  const label=(team:typeof c.teams[number])=>`${team.name} · ${team.start}–${team.end}`;
  if(!result.valid)throw Error('A escala tem conflitos obrigatórios. Corrija-os antes de exportar.');
  const book=new ExcelJS.Workbook();book.creator='Compasso';book.calcProperties.fullCalcOnLoad=true;
  const schedule=book.addWorksheet('Escala'),coverage=book.addWorksheet('Cobertura'),validation=book.addWorksheet('Validação 5x2'),transition=book.addWorksheet('Transição');
  schedule.addRow([`Escala 5×2 · ${c.start} a ${c.end} · ${c.members.length} pessoas`]);
  schedule.mergeCells(1,1,1,result.dates.length+5);
  schedule.addRow(['As jornadas descontam o intervalo cadastrado. A validação é contínua dentro do período e usa o histórico anterior quando informado.']);
  schedule.mergeCells(2,1,2,result.dates.length+5);schedule.getCell('A2').alignment={wrapText:true};schedule.getRow(2).height=30;
  schedule.addRow([]);
  schedule.addRow(['Colaborador','Turma','Regime inicial','Regime final',...result.dates.map(d=>new Date(`${d.iso}T00:00:00Z`)),'Total de horas']);
  const lastDateColumn=schedule.getColumn(result.dates.length+4).letter,totalColumn=schedule.getColumn(result.dates.length+5).letter;
  const colors={blue:'FFDCEBFC',green:'FFDFEFE6',amber:'FFFFF0CE',purple:'FFEDE2FA'};
  result.validation.forEach((person,index)=>{
    const row=index+5,team=c.teams.find(t=>t.id===person.teamId)!,hours=plannerTeamHours(team).calculated;
    const values=[person.name,team.name,person.before,person.after,...result.rows[person.id].map((v,i)=>{const actual=c.teams.find(t=>t.id===result.shifts[person.id][i])??team;return v?(flexible?label(actual):`${actual.start}–${actual.end}`):'FOLGA';})];
    schedule.addRow(values);
    result.dates.forEach((d,i)=>{
      const cell=schedule.getCell(row,i+5),working=result.rows[person.id][i],actual=c.teams.find(t=>t.id===result.shifts[person.id][i])??team;
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:working?colors[actual.color]:'FFFFE5EB'}};
      cell.font={size:10,color:{argb:working?'FF294455':'FFAC405D'}};
      cell.alignment={horizontal:'center',vertical:'middle'};
      if(working)cell.note=`Intervalo: ${actual.breakStart}–${actual.breakEnd}. Horas calculadas: ${duration(plannerTeamHours(actual).calculated)}.`;
    });
    schedule.getCell(`${totalColumn}${row}`).value={formula:flexible?c.teams.map(t=>`COUNTIF(E${row}:${lastDateColumn}${row},${excelText(label(t))})*${fraction(plannerTeamHours(t).calculated)}`).join('+'):`COUNTIF(E${row}:${lastDateColumn}${row},"<>FOLGA")*'Validação 5x2'!I${index+2}`,result:fraction(person.hours)};
    schedule.getCell(`${totalColumn}${row}`).numFmt='[h]:mm';
  });
  schedule.columns.forEach((col,i)=>col.width=i===0?25:i<4?23:18);
  result.dates.forEach((d,i)=>{
    const cell=schedule.getCell(4,i+5);cell.numFmt='dd/mm/yy ddd';
    if(d.weekday===5||d.weekday===6)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:d.weekday===5?'FF8B662C':'FF8F3B53'}};
    if(result.transitions.some(t=>t.date===d.iso))cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6E4297'}};
  });
  schedule.views=[{state:'frozen',xSplit:4,ySplit:4}];

  coverage.addRow(['Data','Dia','Pessoas','Mínimo','Meta',...c.teams.map(t=>t.name),'Resultado']);
  result.coverage.forEach((d,index)=>{
    const column=schedule.getColumn(index+5).letter,row=index+2,start=5,end=c.members.length+4;
    coverage.addRow([new Date(`${d.date}T00:00:00Z`),plannerWeekdays[d.weekday],null,d.minimum,d.desired,...c.teams.map(t=>d.teams[t.id]),d.valid?'OK':'ERRO']);
    coverage.getCell(`A${row}`).numFmt='dd/mm/yyyy';
    coverage.getCell(`C${row}`).value={formula:`COUNTIF(Escala!${column}${start}:${column}${end},"<>FOLGA")`,result:d.present};
    c.teams.forEach((team,j)=>coverage.getCell(row,j+6).value={formula:flexible?`COUNTIF(Escala!${column}${start}:${column}${end},${excelText(label(team))})`:`COUNTIFS(Escala!$B$${start}:$B$${end},${excelText(team.name)},Escala!${column}${start}:${column}${end},"<>FOLGA")`,result:d.teams[team.id]});
    const totalCheck=`C${row}>=D${row}`;
    const checks=c.teamCoverage==='required'?c.teams.map((t,j)=>`${coverage.getColumn(j+6).letter}${row}>=${t.minimum[d.weekday]}`):[];
    const fixedRest=c.distribution==='fixed'&&c.allowedModels.every(model=>c.restDays[model].includes(d.weekday));
    coverage.getCell(row,c.teams.length+6).value={formula:`IF(AND(${[totalCheck,...checks,...(fixedRest?[`C${row}=0`]:[])].join(',')}),"OK","ERRO")`,result:d.valid?'OK':'ERRO'};
  });
  coverage.columns.forEach((col,i)=>col.width=i===0?16:18);coverage.views=[{state:'frozen',ySplit:1}];

  validation.addRow(['Colaborador','Turma','Regime anterior','Regime posterior','Maior sequência','Sábados','Segundas','Total de horas','Horas/dia','Resultado 5x2']);
  const fullWeeks=new Map<string,number[]>();
  result.dates.forEach((d,i)=>{const dt=new Date(`${d.iso}T00:00:00Z`);dt.setUTCDate(dt.getUTCDate()-d.weekday);const key=dt.toISOString().slice(0,10);fullWeeks.set(key,[...(fullWeeks.get(key)??[]),i]);});
  result.validation.forEach((p,index)=>{
    const row=index+2,source=index+5,team=c.teams.find(t=>t.id===p.teamId)!,member=c.members.find(m=>m.id===p.id)!;
    validation.addRow([p.name,team.name,p.before,p.after,null,null,null,null,fraction(plannerTeamHours(team).calculated),null]);
    validation.getCell(`I${row}`).numFmt='[h]:mm';validation.getCell(`I${row}`).font={color:{argb:'FF2563EB'}};
    validation.getCell(`H${row}`).value={formula:`Escala!${totalColumn}${source}`,result:fraction(p.hours)};validation.getCell(`H${row}`).numFmt='[h]:mm';
    let previous=0;for(let i=member.previousDays.length-1;i>=0&&member.previousDays[i];i--)previous++;
    result.dates.forEach((d,i)=>{
      const col=16+i,address=validation.getColumn(col).letter,sourceCol=schedule.getColumn(i+5).letter;
      const prev=i?`${validation.getColumn(col-1).letter}${row}`:String(previous);
      validation.getCell(`${address}${row}`).value={formula:`IF(Escala!${sourceCol}${source}="FOLGA",0,${prev}+1)`,result:0};validation.getColumn(col).hidden=true;
    });
    const seqStart=validation.getColumn(16).letter,seqEnd=validation.getColumn(15+result.dates.length).letter;
    validation.getCell(`E${row}`).value={formula:`MAX(${seqStart}${row}:${seqEnd}${row})`,result:p.maximum};
    for(const [dest,day,count] of [['F',5,p.saturdays],['G',0,p.mondays]] as const){
      const refs=result.dates.flatMap((d,i)=>d.weekday===day?[`IF(Escala!${schedule.getColumn(i+5).letter}${source}<>"FOLGA",1,0)`]:[]);
      validation.getCell(`${dest}${row}`).value={formula:refs.length?`SUM(${refs.join(',')})`:'0',result:count};
    }
    const validWeekCells:string[]=[];let wi=0;
    for(const indexes of fullWeeks.values()){
      const col=16+result.dates.length+wi++,address=`${validation.getColumn(col).letter}${row}`;
      validation.getColumn(col).hidden=true;validWeekCells.push(address);
      const first=schedule.getColumn(5+indexes[0]).letter,last=schedule.getColumn(5+indexes.at(-1)!).letter;
      const count=`COUNTIF(Escala!${first}${source}:${last}${source},"<>FOLGA")`;
      let expression=flexible?`${c.teams.map(t=>`COUNTIF(Escala!${first}${source}:${last}${source},${excelText(label(t))})*${fraction(plannerTeamHours(t).calculated)}`).join('+')}<=${c.targetHours}/24`:`${count}*$I${row}<=${c.targetHours}/24`;
      const fixedRest=indexes.filter(i=>c.distribution==='fixed'&&c.allowedModels.every(model=>c.restDays[model].includes(result.dates[i].weekday)));
      if(fixedRest.length)expression=`AND(${expression},${fixedRest.map(i=>`Escala!${schedule.getColumn(5+i).letter}${source}="FOLGA"`).join(',')})`;
      if(indexes.length===7){
        const models=c.allowedModels.map(model=>`AND(${c.restDays[model].map(day=>`Escala!${schedule.getColumn(5+indexes[day]).letter}${source}="FOLGA"`).join(',')})`);
        expression=c.distribution==='fixed'?`AND(${count}=5,OR(${models.join(',')}),${expression})`:`AND(${count}=5,${expression})`;
      }
      validation.getCell(address).value={formula:`IF(${expression},1,0)`,result:1};
    }
    const sundayChecks:string[]=[];
    if(c.distribution==='automatic'){
      const sundayIndexes=result.dates.flatMap((d,i)=>d.weekday===6?[i]:[]);
      if(c.sundayRule==='all')sundayChecks.push(...sundayIndexes.map(i=>`Escala!${schedule.getColumn(i+5).letter}${source}="FOLGA"`));
      if(c.sundayRule==='alternate')for(const i of sundayIndexes){const previous=i-7;if(previous>=0)sundayChecks.push(`OR(Escala!${schedule.getColumn(i+5).letter}${source}="FOLGA",Escala!${schedule.getColumn(previous+5).letter}${source}="FOLGA")`);else if(member.previousDays[member.previousDays.length+previous])sundayChecks.push(`Escala!${schedule.getColumn(i+5).letter}${source}="FOLGA"`);}
      if(c.sundayRule==='minimum')for(const month of new Set(result.dates.map(d=>d.iso.slice(0,7)))){const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);if(c.start<=month+'-01'&&c.end>=end){const refs=sundayIndexes.filter(i=>result.dates[i].iso.startsWith(month)).map(i=>`IF(Escala!${schedule.getColumn(i+5).letter}${source}="FOLGA",1,0)`);sundayChecks.push(`${refs.length?`SUM(${refs.join(',')})`:'0'}>=${c.minimumSundays}`);}}
    }
    validation.getCell(`J${row}`).value={formula:`IF(AND(E${row}<=${c.maxConsecutive},SUM(${validWeekCells.join(',')})=${validWeekCells.length}${sundayChecks.map(check=>`,`+check).join('')}),"OK","ERRO")`,result:p.result};
  });
  validation.columns.forEach((col,i)=>{if(i<10)col.width=i===0?25:i<4?24:19;});
  validation.views=[{state:'frozen',ySplit:1}];
  const noteRow=result.validation.length+4;
  validation.mergeCells(noteRow,1,noteRow,10);validation.getCell(noteRow,1).value=flexible?'Os horários indicam a turma efetivamente coberta. Os totais usam os horários configurados; edite a escala no aplicativo para recalcular as atribuições. Confira a cobertura e o descanso entre jornadas.':'Resultado 5x2 valida a sequência e as semanas. Confira também a aba Cobertura. Horas/dia são editáveis; mudar apenas o texto de um horário na grade não recalcula a jornada diária.';validation.getCell(noteRow,1).alignment={wrapText:true};validation.getRow(noteRow).height=36;
  result.issues.forEach((issue,i)=>{validation.getCell(noteRow+i+2,1).value=issue.severity==='error'?'ERRO':'OBSERVAÇÃO';validation.mergeCells(noteRow+i+2,2,noteRow+i+2,10);validation.getCell(noteRow+i+2,2).value=issue.message;validation.getCell(noteRow+i+2,2).alignment={wrapText:true};validation.getRow(noteRow+i+2).height=30;});

  transition.addRow(['Troca','Colaborador','Turma','Regime anterior','Regime posterior',...Array.from({length:15},(_,i)=>`${i-7>=0?'+':''}${i-7} dias`)]);
  for(const change of result.transitions)for(const p of c.members){
    const team=c.teams.find(t=>t.id===p.teamId)!;
    transition.addRow([change.date,p.name,team.name,change.before[p.id],change.after[p.id],...Array.from({length:15},(_,i)=>{
      const value=new Date(Date.parse(`${change.date}T00:00:00Z`)+(i-7)*86400000).toISOString().slice(0,10),index=result.dates.findIndex(d=>d.iso===value);
      const actual=c.teams.find(t=>t.id===result.shifts[p.id][index])??team;return index<0?'Fora do período':result.rows[p.id][index]?(flexible?label(actual):`${actual.start}–${actual.end}`):'FOLGA';
    })]);
  }
  if(!result.transitions.length)transition.addRow(['Sem trocas de grupo dentro do período selecionado.']);
  transition.columns.forEach((col,i)=>col.width=i===1?25:i<5?23:18);transition.views=[{state:'frozen',xSplit:5,ySplit:1}];

  for(const sheet of book.worksheets){
    const header=sheet===schedule?4:1;
    sheet.getRow(header).font={bold:true,color:{argb:'FFFFFFFF'}};
    sheet.getRow(header).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173F4C'}};
    sheet.getRow(header).height=28;
    sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};
    sheet.eachRow(row=>row.eachCell(cell=>{if(cell.value==='FOLGA'){cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFE5EB'}};cell.font={color:{argb:'FFAC405D'}};}}));
  }
  // Apply date accents after the shared header styling.
  result.dates.forEach((d,i)=>{
    const cell=schedule.getCell(4,i+5);
    if(d.weekday===5||d.weekday===6)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:d.weekday===5?'FF8B662C':'FF8F3B53'}};
    if(result.transitions.some(t=>t.date===d.iso))cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6E4297'}};
  });
  if(format==='xlsx')return Buffer.from(await book.xlsx.writeBuffer());
  const quote=(v:unknown)=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
  const output:string[]=[];
  for(const sheet of book.worksheets){output.push(quote(sheet.name));sheet.eachRow(row=>{const values:unknown[]=[];row.eachCell({includeEmpty:true},(cell,col)=>{if(sheet.getColumn(col).hidden)return;let value:unknown=cell.type===ExcelJS.ValueType.Formula?cell.result:cell.value;if(value instanceof Date)value=value.toISOString().slice(0,10);if(typeof value==='number'&&cell.numFmt==='[h]:mm')value=duration(value*1440);values.push(value??'');});output.push(values.map(quote).join(';'));});output.push('');}
  return Buffer.from('\ufeff'+output.join('\r\n'));
}
