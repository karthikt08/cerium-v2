// CERIUM dial-code picker; progressive enhancement of the original native select.
// No remote requests, browser storage, or changes to verified billing country.
import {COUNTRY_OPTIONS,validCountry} from './countries.js';

export function matchingCountries(query='',items=COUNTRY_OPTIONS){
  const q=String(query).trim().toLocaleLowerCase().replace(/^\+/,'');
  if(!q)return items;
  return items.filter(c=>c.label.toLocaleLowerCase().includes(q) ||
    c.value.toLocaleLowerCase()===q ||
    c.callingCode.startsWith(q));
}
export function countryRowLabel({label,callingCode}) {
  return label+' | +'+callingCode;
}
export function mountCountryPicker({select,trigger,panel,search,options,empty,displayName,displayCode}){
  if(!select||!trigger||!panel||!search||!options||!empty) return null;
  select.classList.add('dial-native-select');
  // Scripted validation is already performed by verify-phone.js and uses the
  // real select value, which stays the source of truth.
  select.required=false;
  trigger.hidden=false;
  let filtered=[],active=0;
  const isOpen=()=>!panel.hidden;
  function sync(){
    const country=COUNTRY_OPTIONS.find(c=>c.value===select.value);
    displayName.textContent=country?.label||'Choose your country';
    displayCode.textContent=country?'+'+country.callingCode:'+—';
    trigger.setAttribute('aria-label',country?countryRowLabel(country)+'. Change country':'Choose business country and calling code');
    options.querySelectorAll('[role="option"]').forEach(item=>item.setAttribute('aria-selected',String(item.dataset.country===select.value)));
  }
  function focusActive(){
    const rows=[...options.querySelectorAll('[role="option"]')];
    if(!rows.length)return;
    active=(active+rows.length)%rows.length;
    rows.forEach((row,i)=>row.tabIndex=i===active?0:-1);
    rows[active].focus();
  }
  function render(query=''){
    filtered=matchingCountries(query);
    options.replaceChildren();
    empty.hidden=filtered.length!==0;
    const frag=document.createDocumentFragment();
    for(const [i,country] of filtered.entries()){
      const row=document.createElement('button');
      row.type='button';row.className='dial-option';
      row.setAttribute('role','option');row.setAttribute('aria-selected',String(country.value===select.value));
      row.dataset.country=country.value;row.tabIndex=i===0?0:-1;
      const name=document.createElement('span');name.className='dial-option-name';name.textContent=country.label;
      const code=document.createElement('span');code.className='dial-option-code';code.textContent='+'+country.callingCode;
      row.append(name,code);frag.append(row);
    }
    options.append(frag);
    const found=filtered.findIndex(c=>c.value===select.value);
    active=found<0?0:found;
  }
  function open(){
    if(isOpen())return;
    search.value='';render();
    panel.hidden=false;trigger.setAttribute('aria-expanded','true');
    trigger.classList.add('is-active');
    search.focus();
  }
  function close({focus=false}={}){
    if(!isOpen())return;
    panel.hidden=true;trigger.setAttribute('aria-expanded','false');
    trigger.classList.remove('is-active');
    if(focus)trigger.focus();
  }
  function choose(value){
    if(!validCountry(value))return;
    select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));
    sync();close({focus:true});
  }
  trigger.addEventListener('click',()=>isOpen()?close({focus:true}):open());
  search.addEventListener('input',()=>render(search.value));
  search.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close({focus:true});}
    if(event.key==='ArrowDown'||event.key==='Enter'){
      event.preventDefault();if(filtered.length)focusActive();
    }
  });
  options.addEventListener('click',event=>{
    const row=event.target.closest('[data-country]');
    if(row&&options.contains(row))choose(row.dataset.country);
  });
  options.addEventListener('keydown',event=>{
    const rows=[...options.querySelectorAll('[role="option"]')];
    if(!rows.length)return;
    if(event.key==='Escape'){event.preventDefault();close({focus:true});}
    else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      const current=rows.indexOf(document.activeElement);
      active=(current+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length;
      focusActive();
    } else if(event.key==='Home'||event.key==='End'){
      event.preventDefault();active=event.key==='Home'?0:rows.length-1;focusActive();
    }
  });
  document.addEventListener('pointerdown',event=>{
    if(isOpen()&&!trigger.closest('.dial-picker')?.contains(event.target))close();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&isOpen()){event.preventDefault();close({focus:true});}
  });
  select.addEventListener('change',sync);
  sync();
  return {sync,open,close};
}
