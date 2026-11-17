import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBackup} from './workspace';
const legacy={branch:'b1',sector:'s1',branches:[{id:'b1',name:'Filial original',sectors:[{id:'s1',name:'Vendas',people:[{id:'a',name:'Ana Silva',sex:'F',start:'19:00',breakStart:'01:00',breakEnd:'02:00',end:'06:05',off:2,limit:42}],minimum:1,maxDays:6,sunday:'alternate',night:true,holidays:'15, 25',plans:{'2026-11':{rows:{a:['W','F','X']}}}}]}]};
test('backup antigo mantém filiais, pessoas, horários, limites e escalas',()=>{const original=JSON.stringify(legacy),migrated=parseBackup(legacy),sector=migrated.branches[0].sectors[0];assert.equal(migrated.version,2);assert.equal(migrated.journey.reducedNight,true);assert.equal(migrated.branch,'b1');assert.equal(sector.people[0].start,'19:00');assert.equal(sector.people[0].limit,42);assert.deepEqual(sector.rules.holidays,[15,25]);assert.deepEqual(sector.plans['2026-11'].a,[true,false,false]);assert.equal(JSON.stringify(legacy),original);assert.deepEqual(parseBackup(migrated),migrated);});
test('backup inválido não é aceito',()=>{assert.throws(()=>parseBackup({branches:[]}));assert.throws(()=>parseBackup({...legacy,sector:'inexistente'}));});
test('backup preserva os dias de trabalho e folga personalizados',()=>{
 const data=parseBackup(legacy),workingDays=[false,true,true,false,true,true,true];
 const restored=parseBackup({...data,journey:{...data.journey,workingDays}});
 assert.deepEqual(restored.journey.workingDays,workingDays);
});
