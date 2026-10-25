// Bounded, read-only CSV and Office Open XML (.xlsx) parsing. No macros, formula evaluation or external services.
import {inflateRawSync} from 'node:zlib';

const MAX_FILE=2*1024*1024, MAX_XML=8*1024*1024, MAX_ROWS=2000, MAX_COLS=40;
const bad=message=>Object.assign(new Error(message),{status:400,code:'invalid_spreadsheet'});
const text=bytes=>{
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{throw bad('Use a UTF-8 CSV file or a standard .xlsx workbook.');}
};
const xmlText=s=>String(s).replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi,(m,num,named)=>{
  if(named)return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[named.toLowerCase()];
  const n=num[0].toLowerCase()==='x'?parseInt(num.slice(1),16):Number(num);
  return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';
});
function table(rows){
  const populated=rows.filter(r=>r.some(v=>String(v??'').trim()));
  if(populated.length<2)throw bad('The spreadsheet needs a header row and at least one data row.');
  if(populated.length-1>MAX_ROWS)throw bad('Import at most 2,000 rows at a time. Split larger files.');
  const headers=populated[0].slice(0,MAX_COLS).map(x=>String(x??'').trim());
  if(!headers.some(Boolean))throw bad('The first row must contain column headers.');
  if(headers.length>MAX_COLS||populated.some(r=>r.length>MAX_COLS&&r.slice(MAX_COLS).some(x=>String(x).trim())))
    throw bad('Use a spreadsheet with at most 40 populated columns.');
  return {headers,rows:populated.slice(1).map(r=>headers.map((_,i)=>String(r[i]??'').trim()))};
}
function csvRows(input){
  const first=input.replace(/^\uFEFF/,'');
  const sample=first.split(/\r?\n/,1)[0];
  const countSep=c=>{let quoted=false,n=0;for(let i=0;i<sample.length;i++){if(sample[i]==='"'){if(quoted&&sample[i+1]==='"')i++;else quoted=!quoted;}else if(!quoted&&sample[i]===c)n++;}return n;};
  const delim=[',',';','\t'].sort((a,b)=>countSep(b)-countSep(a))[0];
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<first.length;i++){
    const c=first[i];
    if(c==='"'){if(quoted&&first[i+1]==='"'){cell+='"';i++;}else if(!quoted&&cell===''){quoted=true;}else if(quoted){quoted=false;}else throw bad('CSV contains a misplaced quote.');}
    else if(c===delim&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&first[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';if(rows.length>MAX_ROWS+3)throw bad('Import at most 2,000 rows at a time.');}
    else cell+=c;
    if(cell.length>10000)throw bad('A spreadsheet cell is too large.');
  }
  if(quoted)throw bad('CSV contains an unfinished quoted value.');
  if(row.length||cell){row.push(cell);rows.push(row);}
  return table(rows);
}
function zipFiles(buffer){
  const endMin=Math.max(0,buffer.length-65557);let e=-1;
  for(let i=buffer.length-22;i>=endMin;i--)if(buffer.readUInt32LE(i)===0x06054b50){e=i;break;}
  if(e<0)throw bad('The .xlsx file is not a valid ZIP workbook.');
  const count=buffer.readUInt16LE(e+10),cdOffset=buffer.readUInt32LE(e+16);
  if(count>150||cdOffset>=buffer.length||buffer.readUInt16LE(e+8)!==count)throw bad('The workbook contains unsupported ZIP entries.');
  const out=new Map();let pos=cdOffset,total=0;
  for(let i=0;i<count;i++){
    if(pos+46>buffer.length||buffer.readUInt32LE(pos)!==0x02014b50)throw bad('Invalid workbook ZIP directory.');
    const flags=buffer.readUInt16LE(pos+8),method=buffer.readUInt16LE(pos+10);
    const compressed=buffer.readUInt32LE(pos+20),expanded=buffer.readUInt32LE(pos+24);
    const nameSize=buffer.readUInt16LE(pos+28),extra=buffer.readUInt16LE(pos+30),comment=buffer.readUInt16LE(pos+32),off=buffer.readUInt32LE(pos+42);
    if(flags&1||![0,8].includes(method)||compressed===0xffffffff||expanded===0xffffffff||off===0xffffffff)
      throw bad('Encrypted or unsupported ZIP workbooks cannot be imported.');
    if(pos+46+nameSize+extra+comment>buffer.length)throw bad('Invalid workbook entry.');
    const name=buffer.subarray(pos+46,pos+46+nameSize).toString('utf8');
    pos+=46+nameSize+extra+comment;
    if(!/^(xl\/sharedStrings\.xml|xl\/worksheets\/sheet\d+\.xml)$/.test(name))continue;
    if(out.has(name)||expanded>MAX_XML||total+expanded>12*1024*1024||off+30>buffer.length||buffer.readUInt32LE(off)!==0x04034b50)
      throw bad('The workbook has invalid or oversized data.');
    const dataStart=off+30+buffer.readUInt16LE(off+26)+buffer.readUInt16LE(off+28);
    if(dataStart+compressed>buffer.length)throw bad('The workbook has a truncated worksheet.');
    let bytes;
    try{bytes=method===0?buffer.subarray(dataStart,dataStart+compressed):inflateRawSync(buffer.subarray(dataStart,dataStart+compressed),{maxOutputLength:MAX_XML});}
    catch{throw bad('The workbook contains a damaged or oversized worksheet.');}
    if(bytes.length!==expanded)throw bad('The workbook worksheet length is incorrect.');
    total+=expanded;out.set(name,text(bytes));
  }
  return out;
}
function xlsxRows(buffer){
  const files=zipFiles(buffer);
  const sheet=[...files.keys()].filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a,b)=>Number(a.match(/sheet(\d+)/)[1])-Number(b.match(/sheet(\d+)/)[1]))[0];
  if(!sheet)throw bad('No usable worksheet was found in the .xlsx file.');
  const shared=[];
  const sharedXml=files.get('xl/sharedStrings.xml')||'';
  for(const match of sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)){
    shared.push([...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>xmlText(m[1])).join(''));
    if(shared.length>100000)throw bad('The workbook has too many shared strings.');
  }
  const rows=[];
  for(const match of files.get(sheet).matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)){
    const row=[];
    for(const c of match[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const ref=/\br="([A-Z]+)\d+"/.exec(c[1]);
      if(!ref)continue;
      let col=0;for(const ch of ref[1])col=col*26+ch.charCodeAt(0)-64;col--;
      if(col<0)continue;
      if(col>=MAX_COLS)throw bad('The workbook has columns beyond the 40-column limit.');
      const kind=/\bt="([^"]+)"/.exec(c[1])?.[1]||'';
      const body=c[2]||'';
      const raw=/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1]||'';
      let value;
      if(kind==='s'){const index=Number(raw);value=Number.isInteger(index)?shared[index]:undefined;if(value===undefined)throw bad('Invalid shared-string reference in workbook.');}
      else if(kind==='inlineStr')value=[...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>xmlText(m[1])).join('');
      else if(kind==='e')value='';
      else value=xmlText(raw);
      row[col]=value;
    }
    if(row.some(v=>String(v??'').trim()))rows.push(row);
    if(rows.length>MAX_ROWS+2)throw bad('Import at most 2,000 rows at a time.');
  }
  return table(rows);
}
export function parseSpreadsheet(upload){
  const filename=upload?.filename,content=upload?.content;
  if(typeof filename!=='string'||!/\.(csv|xlsx)$/i.test(filename))throw bad('Choose a .csv or .xlsx file. Legacy .xls files must be saved as .xlsx or CSV.');
  if(typeof content!=='string'||content.length>Math.ceil(MAX_FILE*4/3)+8||!/^[A-Za-z0-9+/]*={0,2}$/.test(content))
    throw bad('Invalid file data. Files must be at most 2 MB.');
  const buffer=Buffer.from(content,'base64');
  if(!buffer.length||buffer.length>MAX_FILE)throw bad('Choose a nonempty file of at most 2 MB.');
  if(/\.csv$/i.test(filename))return csvRows(text(buffer));
  if(buffer.subarray(0,2).toString()!=='PK')throw bad('Choose a valid .xlsx workbook, not a renamed file.');
  return xlsxRows(buffer);
}
export const LEAD_FIELDS=['name','phone','email','address','source','stage','value','nextFollowUp','notes'];
const ALIASES={
  name:['name','customer','customername','client','clientname','contact','contactname','fullname','leadname'],
  phone:['phone','phone number','phonenumber','mobile','mobile number','mobilenumber','contactnumber','telephone'],
  email:['email','emailaddress','emailid','mail'],
  address:['address','customeraddress','clientaddress','streetaddress'],
  source:['source','leadsource','origin','channel'],
  stage:['stage','status','leadstatus','pipelinestage'],
  value:['value','dealvalue','estimatedvalue','amount','budget'],
  nextFollowUp:['nextfollowup','followupdate','nextcontact','callbackdate'],
  notes:['notes','note','remarks','comments','description']
};
const tidy=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
export function suggestedMapping(headers){
  const selected=new Set(),mapping={};
  for(const field of LEAD_FIELDS){
    const index=headers.findIndex((h,i)=>!selected.has(i)&&ALIASES[field].some(alias=>tidy(alias)===tidy(h)));
    mapping[field]=index>=0?index:null;if(index>=0)selected.add(index);
  }
  return mapping;
}
function normalizeDate(value){
  if(!value)return '';
  if(/^\d+(?:\.\d+)?$/.test(value)&&Number(value)>=20000&&Number(value)<=90000){
    const date=new Date(Date.UTC(1899,11,30)+Math.floor(Number(value))*86400000);
    return date.toISOString().slice(0,10);
  }
  const s=value.trim().replace(/\//g,'-');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw bad('Use YYYY-MM-DD dates (or Excel date cells).');
  const date=new Date(s+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==s)throw bad('Invalid follow-up date.');
  return s;
}
export function mappedLeads(parsed,mapping){
  if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))throw bad('Choose spreadsheet columns for the fields.');
  const used=new Set();
  for(const field of LEAD_FIELDS){
    const i=mapping[field];
    if(i===null||i===undefined||i==='')continue;
    if(!Number.isInteger(i)||i<0||i>=parsed.headers.length||used.has(i))throw bad('A column cannot be mapped twice.');
    used.add(i);
  }
  if(!Number.isInteger(mapping.name))throw bad('Map a customer or lead name column.');
  return parsed.rows.map((values,i)=>{
    const data={},errors=[];
    for(const field of LEAD_FIELDS){
      const ix=mapping[field];data[field]=Number.isInteger(ix)?String(values[ix]??'').trim():'';
    }
    if(!data.name)errors.push('Name is required.');
    if(data.value){
      const num=data.value.replace(/[, ]/g,'').replace(/^[$€£₹]/,'');
      if(!/^\d+(?:\.\d{1,2})?$/.test(num)||Number(num)>1_000_000_000)errors.push('Invalid amount. Use a nonnegative number with up to 2 decimal places.');
      else data.value=num;
    }
    try{data.nextFollowUp=normalizeDate(data.nextFollowUp);}catch(err){errors.push(err.message);}
    if(data.stage){
      const match=['New','Quoted','Booked','Done'].find(x=>x.toLowerCase()===data.stage.toLowerCase());
      if(!match)errors.push('Stage must be New, Quoted, Booked or Done.');
      else data.stage=match;
    }
    return {number:i+2,data,errors};
  });
}
