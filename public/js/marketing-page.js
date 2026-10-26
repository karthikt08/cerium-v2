// The marketing workspace is composed from real Cerium data, not simulated AI
// metrics. Campaign writing happens in the browser and requires human review.
import {marketingInsights,draftMarketingCopy,marketingFollowUp} from './marketing-model.js';
import {escapeHTML as esc} from './workspace-model.js';
import {businessLocalDate} from './us-market.js';

const arrow='<span aria-hidden="true">→</span>';
const navLink=(hash,label)=>'<a href="#'+hash+'" data-nav="'+hash+'" class="marketing-link">'+esc(label)+' '+arrow+'</a>';
const tabs=[
  {key:'visibility',label:'Get found and chosen'},
  {key:'reengage',label:'Re-book and re-engage'},
  {key:'performance',label:'Track performance'}
];
export function renderMarketingPage(ws){
  const today=businessLocalDate(ws?.account?.timeZone);
  const data=marketingInsights(ws,today);
  const business=ws?.account?.businessName||ws?.account?.name||'Your business';
  const service=ws?.account?.trade||'';
  const initial=draftMarketingCopy({kind:'post',businessName:business,service});
  const sources=data.sources.length?data.sources.map(item=>{
    const pct=Math.round(100*item.count/Math.max(1,data.totalLeads));
    return '<div class="marketing-source"><div><strong>'+esc(item.source)+'</strong><span>'+item.count+' lead'+(item.count===1?'':'s')+' · '+pct+'%</span></div><div class="marketing-bar"><span style="width:'+pct+'%"></span></div></div>';
  }).join(''):'<p class="marketing-empty">No lead sources yet. When you save lead origins, this section will show the distribution.</p>';
  const candidates=data.candidates.length?data.candidates.map((person,index)=>
    '<div class="marketing-customer"><div class="marketing-customer-monogram" aria-hidden="true">'+esc((person.name||'?').charAt(0).toUpperCase())+'</div><div class="marketing-customer-details"><strong>'+esc(person.name)+'</strong><small>Last paid invoice · '+esc(person.lastDate||'Date unavailable')+' · '+person.paidInvoices+' paid invoice'+(person.paidInvoices===1?'':'s')+'</small></div>'+
    '<button type="button" class="marketing-light-button" data-marketing-followup="'+index+'">Plan check-in '+arrow+'</button></div>'
  ).join(''):'<div class="marketing-empty marketing-empty-action"><span class="marketing-empty-mark" aria-hidden="true">↗</span><strong>No check-ins to suggest just yet</strong><span>This list uses paid invoices older than 30 days and excludes customers who already have an open follow-up.</span></div>';
  const priorities=data.priorities.slice(0,3).map((item,index)=>
    '<div class="marketing-priority"><span class="marketing-priority-index">0'+(index+1)+'</span><div><strong>'+esc(item.title)+'</strong><p>'+esc(item.reason)+'</p></div></div>').join('');
  const signal=(label,count,detail)=>'<div class="marketing-signal"><span>'+esc(label)+'</span><strong>'+esc(count)+'</strong><small>'+esc(detail)+'</small></div>';
  const stat=(label,count,details)=>'<div class="marketing-stat"><span>'+esc(label)+'</span><strong>'+esc(count)+'</strong><small>'+esc(details)+'</small></div>';
  return '<section class="marketing-page" data-marketing-page>'+
    '<header class="marketing-hero">'+
      '<div class="marketing-hero-copy"><span class="marketing-tag"><span class="marketing-tag-dot" aria-hidden="true"></span> CERIUM / MARKETING</span>'+
        '<h1>Good work.<br><em>More customers.</em></h1>'+
        '<p>Get discovered, stay remembered, and give people a reason to come back. Built around your business—not a collection of marketing gimmicks.</p>'+
        '<div class="marketing-hero-actions"><button type="button" class="marketing-hero-cta" data-marketing-jump="visibility">Create a message <span aria-hidden="true">↗</span></button>'+
          '<button type="button" class="marketing-hero-secondary" data-marketing-jump="performance">View your activity '+arrow+'</button></div>'+
      '</div>'+
      '<div class="marketing-hero-visual" aria-hidden="true">'+
        '<div class="marketing-orbit orbit-one" aria-hidden="true"></div><div class="marketing-orbit orbit-two" aria-hidden="true"></div>'+
        '<div class="marketing-orbit-center"><small>YOUR CUSTOMER CIRCLE</small><span class="marketing-orbit-figure">'+esc(data.totalLeads)+'</span><strong>leads recorded</strong></div>'+
        '<div class="marketing-float marketing-float-top"><span class="marketing-float-dot" aria-hidden="true"></span><div><strong>'+esc(data.reviewsReceived)+'</strong><small>reviews marked received</small></div></div>'+
        '<div class="marketing-float marketing-float-bottom"><span class="marketing-float-symbol" aria-hidden="true">↗</span><div><strong>'+esc(data.repeatCustomers)+'</strong><small>repeat paid customers</small></div></div>'+
      '</div>'+
      '<div class="marketing-hero-foot"><span class="marketing-hero-label">MEASURE WHAT YOU ACTUALLY KNOW</span><span>Based on your Cerium workspace records</span></div>'+
    '</header>'+
    '<div class="marketing-pulsebar" aria-label="Recorded marketing activity">'+
      signal('Leads recorded',data.totalLeads,'Lead records')+
      signal('Review requests',data.reviewRequests,'Marked sent or received')+
      signal('Reviews received',data.reviewsReceived,'Recorded statuses')+
      signal('Returning customers',data.repeatCustomers,'2+ paid invoices')+
    '</div>'+
    '<div class="marketing-layout"><nav class="marketing-switcher" role="tablist" aria-label="Marketing areas">'+
      '<p class="marketing-switcher-title">Your marketing, organized</p>'+
      tabs.map((item,index)=>'<button type="button" role="tab" id="marketing-tab-'+item.key+'" class="marketing-tab'+(index===0?' active':'')+'" data-marketing-tab="'+item.key+'" aria-controls="marketing-panel-'+item.key+'" aria-selected="'+(index===0?'true':'false')+'" tabindex="'+(index===0?'0':'-1')+'">'+
        '<span class="marketing-tab-number">0'+(index+1)+'</span><span class="marketing-tab-copy"><strong>'+esc(item.label)+'</strong><small>'+esc(['Reach & reputation','Customer relationships','What the records show'][index])+'</small></span><span class="marketing-tab-arrow" aria-hidden="true">↗</span></button>').join('')+
      '<p class="marketing-nav-note"><span class="marketing-lock" aria-hidden="true">✓</span> All marketing content stays under your control.</p>'+
    '</nav><div class="marketing-main">'+
    '<section role="tabpanel" tabindex="0" id="marketing-panel-visibility" aria-labelledby="marketing-tab-visibility" data-marketing-panel="visibility">'+
      '<header class="marketing-section-heading"><div><span class="marketing-kicker">01 / REACH & REPUTATION</span><h2>Give people a reason<br>to choose you.</h2>'+
        '<p class="marketing-description">Your work builds your reputation. Make it easier for people to see it and hear from you.</p></div>'+
        '<span class="marketing-section-symbol" aria-hidden="true">↗</span></header>'+
      '<div class="marketing-actions">'+navLink('reviews','Review requests')+navLink('leads','Your enquiries')+'</div>'+
      '<div class="marketing-feature-grid"><div class="marketing-composer">'+
        '<div class="marketing-composer-title"><div><span class="marketing-eyebrow">CONTENT DESK</span><h3>A message worth sharing.</h3><p>Start with a draft, make it yours, then decide whether to publish or send it.</p></div><span class="marketing-draft-badge">DRAFT ONLY</span></div>'+
        '<div class="marketing-fields"><label>What are you writing?<select data-marketing-draft-kind>'+
          '<option value="post">Social post</option><option value="update">Business profile update</option><option value="review">Review request</option><option value="rebook">Re-booking check-in</option></select></label>'+
          '<label>What do you offer?<input data-marketing-service maxlength="100" value="'+esc(service)+'" placeholder="e.g. garden maintenance"></label></div>'+
        '<label class="marketing-message-label">YOUR MESSAGE<textarea data-marketing-draft rows="6" maxlength="1600">'+esc(initial)+'</textarea></label>'+
        '<div class="marketing-composer-actions"><button type="button" class="marketing-light-button" data-marketing-generate>Regenerate draft</button><button type="button" class="marketing-primary-button" data-marketing-copy>Copy draft <span aria-hidden="true">↗</span></button></div>'+
        '<p class="marketing-fineprint" data-marketing-copy-status role="status">Review accuracy, permission and platform rules before sharing. No messages are sent automatically.</p>'+
      '</div><aside class="marketing-next-moves"><span class="marketing-eyebrow">SUGGESTED NEXT STEPS</span><h3>Start where it matters.</h3>'+
        '<div class="marketing-priority-list">'+priorities+'</div>'+
        '<p class="marketing-aside-foot">Suggestions are based only on what you have recorded in Cerium.</p>'+
      '</aside></div>'+
    '</section>'+
    '<section role="tabpanel" tabindex="0" id="marketing-panel-reengage" aria-labelledby="marketing-tab-reengage" data-marketing-panel="reengage" hidden>'+
      '<header class="marketing-section-heading"><div><span class="marketing-kicker">02 / RELATIONSHIPS</span><h2>Be remembered for<br>the right reasons.</h2>'+
        '<p class="marketing-description">Past customers already know your work. A thoughtful check-in can be more useful than a mass campaign.</p></div><span class="marketing-section-symbol" aria-hidden="true">↗</span></header>'+
      '<div class="marketing-actions">'+navLink('followups','All follow-ups')+navLink('invoices','Customer invoices')+'</div>'+
      '<div class="marketing-relationship-summary"><div><span class="marketing-eyebrow">RE-ENGAGEMENT OPPORTUNITIES</span><strong>'+data.candidates.length+'</strong><small>suggested customers to review</small></div>'+
        '<p>Only customers with a paid invoice at least 30 days old and no open follow-up. This is not evidence of consent to marketing.</p></div>'+
      '<div class="marketing-list-heading"><h3>Consider checking in</h3><span>Human review required</span></div>'+
      '<div class="marketing-customer-list">'+candidates+'</div>'+
      '<p class="marketing-fineprint marketing-relationship-note">Plan check-in saves a task in Follow-ups. Verify the customer’s contact preferences before calling, texting, or emailing. No messages are sent automatically.</p>'+
    '</section>'+
    '<section role="tabpanel" tabindex="0" id="marketing-panel-performance" aria-labelledby="marketing-tab-performance" data-marketing-panel="performance" hidden>'+
      '<header class="marketing-section-heading"><div><span class="marketing-kicker">03 / YOUR NUMBERS</span><h2>Know what is<br>actually working.</h2>'+
        '<p class="marketing-description">Clear signals from leads, reviews and follow-ups—not pretend impressions or made-up marketing results.</p></div><span class="marketing-section-symbol" aria-hidden="true">↗</span></header>'+
      '<div class="marketing-insight-grid">'+
        stat('Leads marked Booked or Done',data.bookedLeads,'Of '+data.totalLeads+' recorded leads')+
        stat('Reviews marked received',data.reviewsReceived,'Of '+data.reviewRequests+' requested or received')+
        stat('Due follow-ups',data.dueFollowUps,'Outstanding tasks')+
        stat('Past paying customers',data.pastPaidCustomers,'Deduplicated by name')+
      '</div>'+
      '<section class="marketing-sources"><div class="marketing-list-heading"><h3>Where enquiries originate</h3><span>Based on lead source labels</span></div>'+sources+'</section>'+
      '<div class="marketing-callout"><span class="marketing-callout-mark" aria-hidden="true">i</span><div><strong>What we do not measure yet</strong><p>Cerium does not currently collect website visits, ad impressions, reach, campaign spend, published posts or attributed marketing revenue. We will not display made-up ROI or engagement metrics.</p></div></div>'+
      '<div class="marketing-actions marketing-footer-actions">'+navLink('leads','Review lead sources')+navLink('reviews','Customer feedback')+'</div>'+
    '</section></div></div>'+
  '</section>';
}

export function initializeMarketingUI({root,api,getWorkspace,readOnly=()=>false,onCreated=()=>{},toast=()=>{}}={}){
  const page=root?.querySelector('[data-marketing-page]');
  if(!page)return;
  const choose=key=>{
    const selected=tabs.some(t=>t.key===key)?key:'visibility';
    for(const tab of page.querySelectorAll('[data-marketing-tab]')){
      const on=tab.dataset.marketingTab===selected;
      tab.classList.toggle('active',on);
      tab.setAttribute('aria-selected',String(on));
      tab.tabIndex=on?0:-1;
    }
    for(const panel of page.querySelectorAll('[data-marketing-panel]'))
      panel.hidden=panel.dataset.marketingPanel!==selected;
  };
  const deepLink=()=>/^#marketing\/(visibility|reengage|performance)$/.exec(location.hash)?.[1]||'visibility';
  choose(deepLink());
  const navigateTo=key=>{
    if(!tabs.some(t=>t.key===key))return;
    choose(key);
    // A shareable deep link without remounting the page or erasing an edited draft.
    const hash='#marketing/'+key;
    if(location.hash!==hash)history.replaceState(null,'',hash);
  };
  page.addEventListener('keydown',event=>{
    const tab=event.target.closest('[data-marketing-tab]');
    if(!tab)return;
    if(!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
    event.preventDefault();
    const index=tabs.findIndex(t=>t.key===tab.dataset.marketingTab);
    if(index<0)return;
    const selected=event.key==='Home'?0:event.key==='End'?tabs.length-1:
      (index+((event.key==='ArrowDown'||event.key==='ArrowRight')?1:-1)+tabs.length)%tabs.length;
    navigateTo(tabs[selected].key);
    page.querySelector('#marketing-tab-'+tabs[selected].key)?.focus();
  });
  page.addEventListener('click',async event=>{
    const tab=event.target.closest('[data-marketing-tab]');
    if(tab){navigateTo(tab.dataset.marketingTab);return;}
    const jump=event.target.closest('[data-marketing-jump]');
    if(jump){
      navigateTo(jump.dataset.marketingJump);
      page.querySelector('#marketing-panel-'+jump.dataset.marketingJump)?.focus({preventScroll:true});
      return;
    }
    const generate=event.target.closest('[data-marketing-generate]');
    if(generate){
      const business=getWorkspace()?.account||{};
      const kind=page.querySelector('[data-marketing-draft-kind]')?.value||'post';
      const service=page.querySelector('[data-marketing-service]')?.value||'';
      page.querySelector('[data-marketing-draft]').value=draftMarketingCopy({
        kind,businessName:business.businessName||business.name||'Your business',service
      });
      return;
    }
    const copy=event.target.closest('[data-marketing-copy]');
    if(copy){
      const text=page.querySelector('[data-marketing-draft]')?.value?.trim()||'';
      const note=page.querySelector('[data-marketing-copy-status]');
      if(!text){note.textContent='Write a message before copying it.';return;}
      try{
        if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
        note.textContent='Copied. Review the details and choose when or whether to share.';
      }catch{
        page.querySelector('[data-marketing-draft]').focus();
        page.querySelector('[data-marketing-draft]').select();
        note.textContent='Clipboard permission unavailable. Draft selected—copy it manually.';
      }
      return;
    }
    const followup=event.target.closest('[data-marketing-followup]');
    if(!followup)return;
    if(readOnly()){toast('Your workspace is read-only. Activate your plan to save follow-ups.',true);return;}
    const today=businessLocalDate(getWorkspace()?.account?.timeZone);
    const candidates=marketingInsights(getWorkspace(),today).candidates;
    const index=Number(followup.dataset.marketingFollowup);
    const person=Number.isInteger(index)&&index>=0&&index<candidates.length?candidates[index]:null;
    if(!person){toast('Customer list changed. Refresh Marketing and try again.',true);return;}
    followup.disabled=true;
    try{
      await api.createFollowUp(marketingFollowUp(person,{today}));
      toast('Check-in task saved in Follow-ups. No message was sent.');
      await onCreated();
    }catch(error){
      toast(error?.message||'Could not create follow-up.',true);
      followup.disabled=false;
    }
  });
}
