import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {createReport} from './reports';
import {calculate} from '../domain/journey';
import type {JourneyInput} from '../../shared/contracts';

const input:JourneyInput={start:'19:00',breakStart:'01:00',breakEnd:'02:00',end:'06:05',pattern:'5x2',reducedNight:true,target:42,workingDays:[false,true,true,false,true,true,true]};
// ExcelJS exposes cells with time formats as Date objects when reading a file.
const serial=(v:unknown)=>v instanceof Date?(v.getTime()-Date.UTC(1899,11,30))/86400000:Number(v);

test('XLSX contém batidas numéricas, fórmulas por dia e totais com SUM',async()=>{
 const file=await createReport(input,'xlsx');
 const book=new ExcelJS.Workbook();await book.xlsx.load(file as unknown as ExcelJS.Buffer);
 const sheet=book.worksheets[0],result=calculate(input);
 assert.equal(serial(sheet.getCell('B3').value),19/24);
 assert.equal(serial(sheet.getCell('C3').value),1/24);
 assert.equal(sheet.getCell('B3').numFmt,'hh:mm');
 for(let row=2;row<=8;row++)for(const col of ['F','G','H']){
  assert.equal(sheet.getCell(`${col}${row}`).type,ExcelJS.ValueType.Formula);
  assert.equal(sheet.getCell(`${col}${row}`).numFmt,'[h]:mm');
 }
 for(const col of ['F','G','H'])assert.equal(sheet.getCell(`${col}9`).formula,`SUM(${col}2:${col}8)`);
 assert.ok(Math.abs(serial(sheet.getCell('H9').result)-result.totals.calculated/1440)<1e-8);
 assert.equal(sheet.getColumn(9).hidden,true);
 const xml=await (await JSZip.loadAsync(file)).file('xl/workbook.xml')!.async('string');
 assert.match(xml,/fullCalcOnLoad="1"/);
});

test('redução noturna do Excel depende da opção editável Sim/Não',async()=>{
 const book=new ExcelJS.Workbook();await book.xlsx.load(await createReport(input,'xlsx') as unknown as ExcelJS.Buffer);
 const sheet=book.worksheets[0];
 assert.equal(sheet.getCell('B12').value,'Sim');
 assert.ok(sheet.getCell('G3').formula.includes('$B$12="Sim"'));
 assert.ok(sheet.getCell('F3').formula.includes('M3-N3'));
 assert.equal(sheet.getCell('H3').formula,'SUM(F3:G3)');
 assert.ok(Math.abs(serial(sheet.getCell('F3').result)-245/1440)<1e-8);
 assert.ok(Math.abs(serial(sheet.getCell('G3').result)-(360*8/7)/1440)<1e-8);
});

test('folgas também têm fórmulas prontas para incluir batidas posteriormente',async()=>{
 const book=new ExcelJS.Workbook();await book.xlsx.load(await createReport(input,'xlsx') as unknown as ExcelJS.Buffer);
 const sheet=book.worksheets[0];
 assert.equal(sheet.getCell('B2').value,'Folga');
 assert.ok(sheet.getCell('F2').formula.includes('COUNT(B2:E2)=4'));
 assert.equal(serial(sheet.getCell('H2').result),0);
});

test('CSV mantém horários legíveis e totais estáticos, sem inserir fórmulas',async()=>{
 const csv=(await createReport(input,'csv')).toString();
 assert.ok(csv.includes('"19:00";"01:00";"02:00";"06:05"'));
 assert.ok(csv.includes('"Folga";"Folga";"Folga";"Folga"'));
 assert.ok(!csv.includes('SUM('));
});
