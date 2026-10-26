// Repeatable validation for Cerium NavLM. No network, GPU or private records.
import {NAVLM_HOLDOUT,NAVLM_EXAMPLES} from '../server/navlm-data.js';
import {evaluateNavLM} from '../server/navlm.js';
const outcome=evaluateNavLM(NAVLM_HOLDOUT);
const examples=Object.values(NAVLM_EXAMPLES).reduce((sum,items)=>sum+items.length,0);
console.log('Cerium NavLM v0.1 — TF-IDF nearest-prototype intent classifier');
console.log('Training examples: '+examples);
console.log('Held-out checks: '+outcome.correct+'/'+outcome.total+' ('+(outcome.accuracy*100).toFixed(1)+'%)');
for(const item of outcome.results){
  if(item.expected!==item.predicted)
    console.log('MISSED expected='+item.expected+' predicted='+item.predicted+' reason='+item.reason+' question='+JSON.stringify(item.question));
}
console.log('Note: developer-tuned validation is not an unbiased production accuracy estimate.');
if(outcome.accuracy<0.80)process.exitCode=1;
