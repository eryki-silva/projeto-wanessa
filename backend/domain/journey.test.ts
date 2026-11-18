import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {createReport} from '../services/reports';
import {calculate,generateMonth} from './journey';
import type {JourneyInput} from '../../shared/contracts';
const base:JourneyInput={start:'08:00',breakStart:'12:00',breakEnd:'13:00',end:'17:24',pattern:'5x2',reducedNight:false,target:42};
test('5x2 fecha 42 horas, com cinco trabalhos e duas folgas',()=>{const r=calculate(base);assert.equal(r.totals.calculated,2520);assert.equal(r.totals.offDays,2);assert.equal(r.totals.difference,0);});
test('meia-noite e intervalo são descontados da redução noturna',()=>{const r=calculate({...base,start:'19:00',breakStart:'01:00',breakEnd:'02:00',end:'06:05',reducedNight:true,pattern:'12x36'});assert.equal(r.daily.real,605);assert.equal(r.daily.daytime,245);assert.ok(Math.abs(r.daily.nighttime-360*8/7)<1e-8);assert.equal(r.totals.workingDays,4);assert.equal(r.nextWeek,r.daily.calculated*3);assert.equal(r.average,r.daily.calculated*3.5);});
test('sem redução, total equivale às horas reais',()=>{const r=calculate({...base,start:'22:00',breakStart:'02:00',breakEnd:'03:00',end:'06:00'});assert.equal(r.daily.real,r.daily.calculated);});
test('recusa horário inválido e jornada de 24 horas',()=>{assert.throws(()=>calculate({...base,start:'99:00'}));assert.throws(()=>calculate({...base,end:'08:00'}));});
test('mês com 30 dias e fins de semana de folga em 5x2',()=>{const r=generateMonth('2026-11','5x2',[{id:'1',name:'Ana',role:'Vendas',initials:'AN',color:'green'}]);assert.equal(r.dates.length,30);r.dates.forEach((d,i)=>assert.equal(r.rows['1'][i],d.weekday!==0&&d.weekday!==6));});

test('5x2 permite folgas na segunda e quinta, com sábado e domingo trabalhados',()=>{
 const workingDays=[false,true,true,false,true,true,true];
 const r=calculate({...base,workingDays});
 assert.deepEqual(r.days.map(d=>d.working),workingDays);
 assert.equal(r.days[0].calculated,0);
 assert.equal(r.days[5].calculated,504);
 assert.equal(r.totals.calculated,2520);
 assert.equal(r.cycleValid,true);
 assert.deepEqual(r.warnings,[]);
});
test('quantidade diferente de 5x2 sinaliza o padrão e soma somente dias marcados',()=>{
 const r=calculate({...base,workingDays:[true,false,false,false,true,true,true]});
 assert.equal(r.totals.workingDays,4);
 assert.equal(r.totals.calculated,2016);
 assert.equal(r.cycleValid,false);
 assert.ok(r.warnings[0].includes('4 dias de trabalho'));
});
test('12x36 pode começar com folga e apresentar três plantões na semana',()=>{
 const r=calculate({...base,pattern:'12x36',workingDays:[false,true,false,true,false,true,false]});
 assert.equal(r.totals.workingDays,3);
 assert.equal(r.nextWeek,r.daily.calculated*4);
 assert.equal(r.average,r.daily.calculated*3.5);
 assert.equal(r.cycleValid,true);
});
test('12x36 fora da alternância sinaliza inconsistência',()=>{
 const r=calculate({...base,pattern:'12x36',workingDays:[true,true,false,false,true,false,true]});
 assert.equal(r.cycleValid,false);
 assert.ok(r.warnings[0].includes('alterne'));
});
test('valida exatamente sete seleções booleanas e mantém os dias antigos sem seleção',()=>{
 assert.throws(()=>calculate({...base,workingDays:[true,false]}));
 assert.throws(()=>calculate({...base,workingDays:[true,true,true,true,true,true,'F'] as unknown as boolean[]}));
 assert.deepEqual(calculate(base).days.map(d=>d.working),[true,true,true,true,true,false,false]);
});
test('Excel semanal usa os dias personalizados em vez do fim de semana fixo',async()=>{
 const file=await createReport({...base,workingDays:[false,true,true,false,true,true,true]},'xlsx');
 const book=new ExcelJS.Workbook();await book.xlsx.load(file as unknown as ExcelJS.Buffer);
 const sheet=book.worksheets[0];
 assert.equal(sheet.getCell('B2').value,'Folga');
 assert.equal(sheet.getCell('B5').value,'Folga');
 assert.equal((sheet.getCell('B7').value as Date).getUTCHours(),8);
 assert.equal((sheet.getCell('B8').value as Date).getUTCHours(),8);
 assert.equal(sheet.getCell('H9').formula,'SUM(H2:H8)');
 assert.equal(((sheet.getCell('H9').result as unknown as Date).getTime()-Date.UTC(1899,11,30))/86400000,42/24);
});
