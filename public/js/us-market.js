// Shared US market preferences. Pure module usable by both Node and browsers.
// Territory coverage: 50 states + DC; Puerto Rico is included for US service areas.
export const US_STATES=Object.freeze({
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  DC:'District of Columbia',PR:'Puerto Rico',
});
export const US_TIME_ZONES=Object.freeze({
  'America/New_York':'Eastern (ET)',
  'America/Chicago':'Central (CT)',
  'America/Denver':'Mountain (MT)',
  'America/Phoenix':'Arizona (no DST)',
  'America/Los_Angeles':'Pacific (PT)',
  'America/Anchorage':'Alaska (AKT)',
  'Pacific/Honolulu':'Hawaii (HST)',
  'America/Puerto_Rico':'Puerto Rico (AST)',
});
export const US_STATE_OPTIONS=Object.freeze(Object.entries(US_STATES).map(([value,label])=>({value,label:label+' ('+value+')'})));
export const US_TIME_ZONE_OPTIONS=Object.freeze(Object.entries(US_TIME_ZONES).map(([value,label])=>({value,label})));
export const validUsState=value=>value===''||Object.prototype.hasOwnProperty.call(US_STATES,value);
export const validUsZip=value=>value===''||/^\d{5}(?:-\d{4})?$/.test(value);
export const validUsTimeZone=value=>value===''||Object.prototype.hasOwnProperty.call(US_TIME_ZONES,value);
const validBusinessTimeZone=value=>validUsTimeZone(value)||value==='Asia/Kolkata';
// Store schedule times as wall-clock business-local values: never silently
// reinterpret existing job startAt/endAt as UTC.
export function businessLocalDate(timeZone,date=new Date()){
  if(!timeZone||!validBusinessTimeZone(timeZone))
    return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=type=>parts.find(p=>p.type===type)?.value;
  return get('year')+'-'+get('month')+'-'+get('day');
}
// Familiar display without rewriting saved phone values or dropping extensions.
export function formatUSPhone(value){
  const input=String(value??'').trim();
  const compact=input.replace(/[^\d]/g,'');
  const digits=compact.length===11&&compact[0]==='1'?compact.slice(1):compact;
  if(digits.length!==10||/[a-z]/i.test(input))return input;
  return '('+digits.slice(0,3)+') '+digits.slice(3,6)+'-'+digits.slice(6);
}


function localParts(date,timeZone){
  const formatter=new Intl.DateTimeFormat('en-US',{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  });
  const parts=formatter.formatToParts(date);
  const val=type=>parts.find(p=>p.type===type)?.value;
  return val('year')+'-'+val('month')+'-'+val('day')+'T'+val('hour')+':'+val('minute');
}
export function businessLocalDateTime(timeZone,date=new Date()){
  if(!timeZone||!validBusinessTimeZone(timeZone))
    return [businessLocalDate('',date),
      String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0')].join('T');
  return localParts(date,timeZone);
}
// Map an explicit business wall-clock choice to a UTC instant. A spring-forward
// gap matches no instants; a fall-back repeated hour matches two. Both should
// prompt the owner to choose an unambiguous time, never silently guess.
export function businessLocalToInstant(value,timeZone){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Choose a valid reminder date and time.');
  const base=Date.parse(value+':00Z');
  if(!Number.isFinite(base)||new Date(base).toISOString().slice(0,16)!==value)
    throw new Error('Choose a valid calendar date and time.');
  if(!timeZone)return new Date(value).toISOString(); // existing device-local fallback
  if(!validBusinessTimeZone(timeZone))throw new Error('Choose a valid business time zone in Settings.');
  const formatter=new Intl.DateTimeFormat('en-US',{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  });
  const match=instant=>{
    const parts=formatter.formatToParts(instant);
    const val=type=>parts.find(p=>p.type===type)?.value;
    return val('year')+'-'+val('month')+'-'+val('day')+'T'+val('hour')+':'+val('minute');
  };
  const matches=[];
  for(let minutes=-840;minutes<=840;minutes+=30){
    const instant=base+minutes*60000;
    if(match(new Date(instant))===value)matches.push(instant);
    if(matches.length>1)break;
  }
  if(matches.length!==1)
    throw new Error('This time is missing or repeated due to daylight saving time. Choose another business-local time.');
  return new Date(matches[0]).toISOString();
}
