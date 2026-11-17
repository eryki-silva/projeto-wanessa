'use strict';
// A real Office Open XML workbook, packaged as an uncompressed ZIP.
function workbookBytes(sheets){
 const encoder=new TextEncoder(),xml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
 const col=n=>{let out='';for(n++;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;};
 const files={
 '[Content_Types].xml':`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`,
 'xl/_rels/workbook.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`
 };
 sheets.forEach((s,i)=>{files[`xl/worksheets/sheet${i+1}.xml`]=`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${Array.from({length:Math.max(...s.rows.map(r=>r.length))},(_,j)=>`<col min="${j+1}" max="${j+1}" width="${j===0?28:18}" customWidth="1"/>`).join('')}</cols><sheetData>${s.rows.map((r,ri)=>`<row r="${ri+1}">${r.map((v,ci)=>typeof v==='number'&&Number.isFinite(v)?`<c r="${col(ci)}${ri+1}"><v>${v}</v></c>`:`<c r="${col(ci)}${ri+1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;});
 const u16=n=>[n&255,n>>>8&255],u32=n=>[n&255,n>>>8&255,n>>>16&255,n>>>24&255];
 const crc=data=>{let c=0xffffffff;for(const byte of data){c^=byte;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;};
 const parts=[],central=[];let offset=0,centralSize=0;
 for(const [name,body] of Object.entries(files)){
  const filename=encoder.encode(name),data=encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+body),checksum=crc(data);
  const header=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(33),...u32(checksum),...u32(data.length),...u32(data.length),...u16(filename.length),...u16(0),...filename]);
  parts.push(header,data);
  const directory=new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(33),...u32(checksum),...u32(data.length),...u32(data.length),...u16(filename.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...filename]);
  central.push(directory);centralSize+=directory.length;offset+=header.length+data.length;
 }
 const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(central.length),...u16(central.length),...u32(centralSize),...u32(offset),...u16(0)]);
 const all=[...parts,...central,end],result=new Uint8Array(offset+centralSize+end.length);let position=0;for(const part of all){result.set(part,position);position+=part.length;}return result;
}
function exportReport(name,sheets,format){
 if(format==='xlsx')return download(name+'.xlsx',workbookBytes(sheets),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 const quote=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
 download(name+'.csv','\ufeff'+sheets.flatMap(s=>[[s.name],...s.rows,[]]).map(r=>r.map(quote).join(';')).join('\r\n'),'text/csv;charset=utf-8');
}
function weeklyReport(){
 const fields=['start','breakStart','breakEnd','end'],ids=['vStart','vBreakStart','vBreakEnd','vEnd'];
 if(ids.some(id=>!$(id).value)||!$('vTarget').value||!$('vTarget').checkValidity())throw Error('Preencha os horários e a meta antes de gerar o relatório.');
 const p=Object.fromEntries(fields.map((f,i)=>[f,$(ids[i]).value])),h=hours(p,$('vNight').checked);
 if(h.real<=0)throw Error('Confira a jornada.');
 const days=journeyDays($('vPattern').value),count=days.filter(Boolean).length,diurnal=h.real-h.night,nocturnal=h.calculated-diurnal;
 return [{name:'Jornada semanal',rows:[['Dia','Entrada','Saída intervalo','Retorno','Saída final','Horas diurnas',$('vNight').checked?'Noturnas reduzidas':'Noturnas reais','Total calculado','Total real'],...days.map((work,i)=>[['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'][i],...(work?fields.map(f=>p[f]):['Folga','Folga','Folga','Folga']),format(work?diurnal:0),format(work?nocturnal:0),format(work?h.calculated:0),format(work?h.real:0)]),['Total da semana','','','','',format(diurnal*count),format(nocturnal*count),format(h.calculated*count),format(h.real*count)],['Meta semanal',format(Number($('vTarget').value)*60)],['Tipo de escala',$('vPattern').selectedOptions[0].textContent],['Observação',$('vNote').textContent]]}];
}
function monthlyReport(){
 const a=analyze();if(!a)throw Error('Gere uma escala mensal antes de exportar.');
 const weeks=[...new Set(a.ds.map(weekKey))];
 return [{name:'Escala mensal',rows:[['Filial',branch().name,'Setor',a.s.name,'Mês',$('month').value],['Colaborador',...a.ds.map(d=>d.toLocaleDateString('pt-BR')),'Horas reais','Horas calculadas'],...a.summaries.map(x=>[x.p.name,...a.plan.rows[x.p.id].map(v=>v==='W'?`${x.p.start}-${x.p.breakStart} / ${x.p.breakEnd}-${x.p.end}`:v==='F'?'Folga':'Fechado'),format(x.real),format(x.total)])]}, {name:'Horas por semana',rows:[['Colaborador',...weeks.map((w,i)=>{const ds=a.ds.filter(d=>weekKey(d)===w);return `Semana ${i+1} (${ds[0].getDate()}–${ds.at(-1).getDate()})`;}),'Total real','Noturnas reais','Total calculado'],...a.summaries.map(x=>[x.p.name,...weeks.map(w=>format(x.weekly[w]||0)),format(x.real),format(x.night),format(x.total)])]},{name:'Observações',rows:[['Pontos para conferir'],...a.warnings.map(w=>[w])]}];
}
$('csv').onclick=()=>{try{exportReport('escala-'+$('month').value,monthlyReport(),$('monthlyFormat').value);}catch(e){alert(e.message);}};
$('exportWeekly').onclick=()=>{try{exportReport('jornada-semanal',weeklyReport(),$('weeklyFormat').value);}catch(e){alert(e.message);}};
function printReport(kind){
 try{if(kind==='weekly')weeklyReport();else if(!analyze())throw Error('Gere uma escala mensal antes de imprimir.');}
 catch(e){return alert(e.message);}
 document.body.classList.remove('print-weekly','print-monthly');document.body.classList.add('print-'+kind);
 window.print();
}
window.addEventListener('afterprint',()=>document.body.classList.remove('print-weekly','print-monthly'));
$('print').onclick=()=>printReport('monthly');$('printWeekly').onclick=()=>printReport('weekly');