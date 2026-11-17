export function duration(value:number){const m=Math.round(Math.abs(value));return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
