import {useEffect,useState} from 'react';
import type {JourneyInput,JourneyResult} from '../../shared/contracts';
import {api} from '../lib/api';
export function useJourney(input:JourneyInput){
 const [result,setResult]=useState<JourneyResult|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(true);
 useEffect(()=>{const controller=new AbortController();setPending(true);setResult(null);setError('');const timer=setTimeout(()=>{api.calculate(input,controller.signal).then(data=>{setResult(data);setPending(false);}).catch((e:Error)=>{if(e.name!=='AbortError'){setResult(null);setError(e.message);setPending(false);}});},180);return()=>{clearTimeout(timer);controller.abort();};},[input]);
 return{result,error,pending};
}
