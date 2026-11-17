import type {JourneyInput,Pattern} from './contracts.js';

export const weekdayNames = ['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'];

export function defaultWorkingDays(pattern:Pattern):boolean[]{
 return Array.from({length:7},(_,i)=>pattern==='12x36'?i%2===0:i<(pattern==='5x2'?5:6));
}

export function workingDays(input:JourneyInput):boolean[]{
 return input.workingDays??defaultWorkingDays(input.pattern);
}
