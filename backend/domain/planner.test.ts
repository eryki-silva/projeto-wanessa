import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {createPlannerExample,plannerConfigSchema} from '../../shared/planner';
import {planPeriod,plannerTeamHours} from './planner';
import {createPlannerReport} from '../services/planner-report';

test('distribuição automática valida domingos alternados e alterações manuais',()=>{
  const config=createPlannerExample();config.start='2027-02-01';config.end='2027-02-28';config.distribution='automatic';config.automaticGroups=5;config.sundayRule='alternate';config.rotation='none';config.minimum=Array(7).fill(0);config.desired=Array(7).fill(8);config.teams.forEach(t=>t.minimum=Array(7).fill(0));
  const result=planPeriod({config});
  for(const p of config.members){const sundays=result.dates.flatMap((d,i)=>d.weekday===6?[result.rows[p.id][i]]:[]);assert.ok(sundays.every((work,i)=>!work||i===0||!sundays[i-1]));}
  const rows=structuredClone(result.rows),person=config.members[0];for(const i of [6,13])rows[person.id][i]=true;
  assert.ok(planPeriod({config,rows}).validation.find(p=>p.id===person.id)!.issues.some(x=>x.includes('dois domingos')));
});

test('distribuição automática verifica mínimo mensal e folga em todos os domingos',()=>{
  const config=createPlannerExample();config.start='2027-02-01';config.end='2027-02-28';config.distribution='automatic';config.sundayRule='all';config.minimum=Array(7).fill(0);config.desired=Array(7).fill(0);config.teams.forEach(t=>t.minimum=Array(7).fill(0));
  const result=planPeriod({config});assert.ok(config.members.every(p=>result.dates.every((d,i)=>d.weekday!==6||!result.rows[p.id][i])));
  config.sundayRule='minimum';config.minimumSundays=2;const rows=structuredClone(result.rows);for(const i of [6,13,20])rows[config.members[0].id][i]=true;
  assert.ok(planPeriod({config,rows}).validation[0].issues.some(x=>x.includes('mínimo de 2')));
});

test('exemplo de 13 pessoas valida 62 dias, cobertura e continuidade',()=>{
  const config=createPlannerExample(),result=planPeriod({config});
  assert.equal(result.dates.length,62);assert.equal(result.valid,true,JSON.stringify(result.issues));
  assert.equal(result.statistics.people,13);
  for(const person of result.validation){assert.equal(person.result,'OK');assert.ok(person.maximum<=5);assert.ok(person.saturdays>0);assert.ok(person.weekly.filter(w=>!w.partial).every(w=>w.days===5&&Math.abs(w.hours-2520)<1e-8));}
  for(const day of result.coverage){assert.equal(day.present,[8,13,13,13,13,5,0][day.weekday]);if(day.weekday===5)assert.deepEqual(day.teams,{t1:2,t2:1,t3:2});}
  assert.ok(result.transitions.every(t=>new Date(t.date+'T00:00:00Z').getUTCDay()===1));
});
test('não aumenta o quadro quando a cobertura é impossível',()=>{
  const config=createPlannerExample();config.minimum[5]=8;
  const result=planPeriod({config});assert.equal(result.valid,false);assert.equal(result.validation.length,13);
  assert.ok(result.issues.some(i=>i.severity==='error'&&i.message.includes('divisão')));
});

test('folgas domingo/segunda e domingo/quarta geram e validam grupos personalizados',()=>{
  const config=createPlannerExample();
  config.restDays={...config.restDays,weekend:[6,0],sunmon:[6,2]};
  config.minimum=[6,13,7,13,13,13,0];config.desired=[...config.minimum];
  const result=planPeriod({config});assert.equal(result.valid,true,JSON.stringify(result.issues));
  for(const day of result.coverage)assert.equal(day.present,config.minimum[day.weekday]);
  assert.ok(result.validation.every(p=>p.maximum<=5&&p.result==='OK'));
  assert.ok(result.validation.some(p=>p.before==='Domingo + Quarta'));
});

test('permite trabalhar domingo quando as combinações escolhidas dão folga em outros dias',()=>{
  const config=createPlannerExample();config.restDays={...config.restDays,weekend:[0,1],sunmon:[2,3]};config.rotation='none';
  config.minimum=Array(7).fill(0);config.desired=Array(7).fill(0);config.teams.forEach(t=>t.minimum=Array(7).fill(0));
  config.members.forEach((p,i)=>p.initialModel=i<6?'weekend':'sunmon');
  const result=planPeriod({config});assert.equal(result.valid,true,JSON.stringify(result.issues));
  assert.ok(result.coverage.filter(d=>d.weekday===6).every(d=>d.present===13));
});

test('recusa dias repetidos e mantém as folgas padrão de configurações antigas',()=>{
  const config=createPlannerExample();config.restDays.weekend=[0,0];assert.equal(plannerConfigSchema.safeParse(config).success,false);
  const {restDays,...legacy}=createPlannerExample();assert.deepEqual(plannerConfigSchema.parse(legacy).restDays,restDays);
});

test('edição que mantém cinco trabalhos mas usa outra combinação de folgas reprova',()=>{
  const config=createPlannerExample();config.restDays={...config.restDays,weekend:[6,0],sunmon:[6,2]};config.minimum=Array(7).fill(0);config.desired=Array(7).fill(0);config.teams.forEach(t=>t.minimum=Array(7).fill(0));
  config.rotation='none';config.members.forEach(p=>p.initialModel='weekend');
  const base=planPeriod({config}),id=config.members[0].id;
  const monday=base.dates.findIndex(d=>d.iso==='2026-12-21'),tuesday=monday+1;
  const rows={...base.rows,[id]:base.rows[id].map((v,i)=>i===monday?true:i===tuesday?false:v)};
  const result=planPeriod({config,rows});assert.equal(result.valid,false);
  assert.ok(result.validation[0].issues.some(i=>i.includes('folgas fora')));
});
test('distingue mínimos obrigatórios de metas desejadas',()=>{
  const config=createPlannerExample();config.desired[5]=8;
  const result=planPeriod({config});assert.equal(result.valid,true);assert.ok(result.issues.some(i=>i.severity==='warning'&&i.message.includes('meta de 8')));
});
test('troca no meio da semana é adiada para a segunda-feira seguinte',()=>{
  const config=createPlannerExample();config.rotationStart='2027-01-20';
  const result=planPeriod({config});assert.equal(result.valid,true);assert.equal(result.transitions[0].date,'2027-01-25');
  assert.ok(result.issues.some(i=>i.message.includes('agendada')));
});
test('histórico anterior participa da sequência contínua',()=>{
  const config=createPlannerExample();config.members[0].previousDays=[true,true,true,true,true];
  const result=planPeriod({config});assert.equal(result.valid,false);assert.ok(result.validation[0].maximum>=6);
});
test('edição manual em domingo reprova e bloqueia exportação',async()=>{
  const config=createPlannerExample(),base=planPeriod({config}),index=base.dates.findIndex(d=>d.weekday===6),id=config.members[0].id;
  const rows={...base.rows,[id]:base.rows[id].map((v,i)=>i===index?true:v)};
  const changed=planPeriod({config,rows});assert.equal(changed.valid,false);assert.equal(changed.validation[0].result,'ERRO');
  await assert.rejects(()=>createPlannerReport({config,rows},'xlsx'),/conflitos obrigatórios/);
});
test('intervalos das três turmas totalizam 8h24 e 42h semanais',()=>{
  for(const team of createPlannerExample().teams){const hours=plannerTeamHours(team);assert.equal(hours.real,504);assert.equal(hours.calculated*5,2520);}
});

test('preferência de cobertura distribui as vagas entre as três turmas',()=>{
  const config=createPlannerExample();config.teamCoverage='preferred';
  const result=planPeriod({config});assert.equal(result.valid,true);
  for(const day of result.coverage.filter(d=>d.weekday===5))assert.deepEqual(config.teams.map(t=>day.teams[t.id]),[2,1,2]);
});

test('pessoas fora do rodízio não geram transições fictícias',()=>{
  const config=createPlannerExample();config.members.forEach(p=>p.rotates=false);
  const result=planPeriod({config});assert.equal(result.transitions.length,0);
  assert.ok(result.issues.some(i=>i.message.includes('nenhuma pessoa mudou')));
});
test('recusa período invertido e equipe com turma inexistente',()=>{
  const config=createPlannerExample();assert.throws(()=>planPeriod({config:{...config,end:'2026-12-01'}}));
  config.members[0].teamId='inexistente';assert.throws(()=>planPeriod({config}));
});
test('arquivo do planejamento tem quatro abas com nomes, cobertura e fórmulas corretos',async()=>{
  const config=createPlannerExample(),result=planPeriod({config}),file=await createPlannerReport({config},'xlsx'),book=new ExcelJS.Workbook();
  await book.xlsx.load(file as unknown as ExcelJS.Buffer);
  assert.deepEqual(book.worksheets.map(s=>s.name),['Escala','Cobertura','Validação 5x2','Transição']);
  const schedule=book.worksheets[0],coverage=book.worksheets[1],validation=book.worksheets[2];
  assert.equal(schedule.getCell('A5').value,config.members[0].name);assert.equal(validation.getCell('A2').value,config.members[0].name);
  assert.ok(schedule.getCell(5,result.dates.length+5).formula.includes('COUNTIF'));
  assert.equal(coverage.getCell('C2').formula,'COUNTIF(Escala!E5:E17,"<>FOLGA")');
  assert.equal(validation.getCell('J2').result,'OK');assert.ok(validation.getCell('E2').formula.startsWith('MAX('));
  assert.equal(book.worksheets[3].rowCount,result.transitions.length*13+1);
});
