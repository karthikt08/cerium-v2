// The marketing workspace is composed from real Cerium data, not simulated AI
// metrics. Campaign writing happens in the browser and requires human review.
import {marketingInsights,draftMarketingCopy,marketingFollowUp} from './marketing-model.js';
import {escapeHTML as esc} from './workspace-model.js';
import {businessLocalDate} from './us-market.js';

const arrow='<span aria-hidden="true">→</span>';
const navLink=(hash,label)=>'<a href="#'+hash+'" data-nav="'+hash+'" class="marketing-link">'+esc(label)+' '+arrow+'</a>';
const stat=(label,count,details)=>'<div class="marketing-stat"><span>'+esc(label)+'</span><strong>'+esc(count)+'</strong><small>'+esc(details)+'</small></div>';
const tabs=[
  {key:'visibility',label:'Get found and chosen'},
  {key:'reengage',label:'Re-book and re-engage'},
  {key:'performance',label:'Track performance'}
];
const strip=content=>'<div class="marketing-strip">'+content+'</div>';
export function renderMarketingPage(ws){
  const today=businessLocalDate(ws?.account?.timeZone);
  const data=marketingInsights(ws,today);
  const business=ws?.account?.businessName||ws?.account?.name||'Your business';
  const service=ws?.account?.trade||'';
  const initial=draftMarketingCopy({kind:'post',businessName:business,service});
  const sources=data.sources.length?data.sources.map(item=>{
    const pct=Math.round(100*item.count/Math.max(1,data.totalLeads));
    return '<div class="marketing-source"><div><strong>'+esc(item.source)+'</strong><span>'+item.count+' lead'+(item.count===1?'':'s')+' · '+pct+'%</span></div><div class="marketing-bar"><span style="width:'+pct+'%"></span></div></div>';
  }).join(''):'<p class="marketing-empty">No leads recorded yet. Add leads and their sources to start seeing the mix.</p>';
  const candidates=data.candidates.length?data.candidates.map((person,index)=>
    '<div class="marketing-customer"><div><strong>'+esc(person.name)+'</strong><small>Last paid invoice: '+esc(person.lastDate||'Date unavailable')+' · '+person.paidInvoices+' paid invoice'+(person.paidInvoices===1?'':'s')+'</small></div>'+
    '<button type="button" class="marketing-light-button" data-marketing-followup="'+index+'">Plan check-in '+arrow+'</button></div>'
  ).join(''):'<div class="marketing-empty">No eligible past customers to suggest yet. This list uses paid invoices older than 30 days and excludes customers with an open follow-up.</div>';
  return '<section class="marketing-page" data-marketing-page>'+
    '<div class="marketing-intro"><span class="marketing-tag">MARKETING</span>'+
      '<h1>Every customer <em>within reach.</em></h1>'+
      '<p>Get discovered, earn reviews, and turn good service into lasting customer relationships. Plan with your existing Cerium records—you choose what gets sent or published.</p>'+
    '</div>'+
    strip(
      stat('Leads recorded',data.totalLeads,'From your Leads workspace')+
      stat('Review requests logged',data.reviewRequests,'Sent or received status recorded')+
      stat('Reviews marked received',data.reviewsReceived,'Reported by you, not a live Google count')+
      stat('Repeat paid customers',data.repeatCustomers,'2+ paid invoices per customer name')
    )+
    '<div class="marketing-layout"><nav class="marketing-switcher" aria-label="Marketing areas">'+
      '<p class="marketing-switcher-title">Plan your marketing</p>'+
      tabs.map((item,index)=>'<button type="button" role="tab" id="marketing-tab-'+item.key+'" class="marketing-tab'+(index===0?' active':'')+'" data-marketing-tab="'+item.key+'" aria-controls="marketing-panel-'+item.key+'" aria-selected="'+(index===0?'true':'false')+'"><span>'+esc(item.label)+'</span>'+arrow+'</button>').join('')+
      '<p class="marketing-nav-note">Drafts stay under your control. Nothing is automatically sent, posted, or shared.</p>'+
    '</nav><div class="marketing-main">'+
    '<section role="tabpanel" id="marketing-panel-visibility" aria-labelledby="marketing-tab-visibility" data-marketing-panel="visibility">'+
      '<p class="marketing-kicker">01 · DISCOVERY & REPUTATION</p><h2>Help more people choose you.</h2>'+
      '<p class="marketing-description">Strengthen your online presence with timely review requests and posts you can tailor to your business.</p>'+
      '<div class="marketing-actions">'+navLink('reviews','Manage review requests')+navLink('leads','Capture an enquiry')+'</div>'+
      '<div class="marketing-priority-list">'+data.priorities.slice(0,2).map(x=>'<div class="marketing-tip"><strong>'+esc(x.title)+'</strong><span>'+esc(x.reason)+'</span></div>').join('')+'</div>'+
      '<div class="marketing-composer"><div class="marketing-composer-title"><div><h3>Draft a marketing message</h3><p>Editable starting points, not an auto-publishing AI service.</p></div></div>'+
        '<div class="marketing-fields"><label>Message type<select data-marketing-draft-kind>'+
          '<option value="post">Social post</option><option value="update">Business profile update</option><option value="review">Review request</option><option value="rebook">Re-booking check-in</option></select></label>'+
          '<label>What do you offer?<input data-marketing-service maxlength="100" value="'+esc(service)+'" placeholder="e.g. scheduled maintenance"></label></div>'+
        '<label class="marketing-message-label">Your draft<textarea data-marketing-draft rows="6" maxlength="1600">'+esc(initial)+'</textarea></label>'+
        '<div class="marketing-composer-actions"><button type="button" class="marketing-light-button" data-marketing-generate>Regenerate draft</button><button type="button" class="button primary" data-marketing-copy>Copy draft</button></div>'+
        '<p class="marketing-fineprint" data-marketing-copy-status role="status">Review accuracy, permission and any platform rules before sharing.</p>'+
      '</div>'+
    '</section>'+
    '<section role="tabpanel" id="marketing-panel-reengage" aria-labelledby="marketing-tab-reengage" data-marketing-panel="reengage" hidden>'+
      '<p class="marketing-kicker">02 · CUSTOMER RELATIONSHIPS</p><h2>Make the next visit easier.</h2>'+
      '<p class="marketing-description">Look after customers who already know your work. Plan a respectful follow-up—Cerium won’t contact them without you.</p>'+
      '<div class="marketing-actions">'+navLink('followups','Open follow-ups')+navLink('invoices','Review customer invoices')+'</div>'+
      '<div class="marketing-callout"><strong>Follow-up candidates</strong><p>Customers with a paid invoice at least 30 days old and no open follow-up. This is a suggested check-in list, not proof that a customer wants marketing.</p></div>'+
      '<div class="marketing-customer-list">'+candidates+'</div>'+
      '<p class="marketing-fineprint">Plan check-in saves a task in Follow-ups. You must verify contact preferences before calling, texting, or emailing. No messages are sent automatically.</p>'+
    '</section>'+
    '<section role="tabpanel" id="marketing-panel-performance" aria-labelledby="marketing-tab-performance" data-marketing-panel="performance" hidden>'+
      '<p class="marketing-kicker">03 · ACTIVITY & INSIGHTS</p><h2>See what is happening.</h2>'+
      '<p class="marketing-description">Real Cerium records show where enquiries come from, how many turn into booked work, and the progress of your review requests.</p>'+
      '<div class="marketing-insight-grid">'+
        stat('Leads marked Booked or Done',data.bookedLeads,'Of '+data.totalLeads+' recorded leads')+
        stat('Review requests marked received',data.reviewsReceived,'Of '+data.reviewRequests+' marked requested or received')+
        stat('Follow-ups currently due',data.dueFollowUps,'Outstanding work across customers')+
        stat('Past customers with paid invoices',data.pastPaidCustomers,'Deduplicated by customer name')+
      '</div>'+
      '<section class="marketing-sources"><h3>Where your leads came from</h3><p>Based only on the source field on your saved leads.</p>'+sources+'</section>'+
      '<div class="marketing-callout"><strong>What we do not measure yet</strong><p>Cerium does not currently collect website visits, ad impressions, reach, campaign spend, published posts or attributed marketing revenue. We will not display made-up ROI or engagement metrics.</p></div>'+
      '<div class="marketing-actions">'+navLink('leads','Review lead sources')+navLink('reviews','Review feedback requests')+'</div>'+
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
    }
    for(const panel of page.querySelectorAll('[data-marketing-panel]'))
      panel.hidden=panel.dataset.marketingPanel!==selected;
  };
  page.addEventListener('click',async event=>{
    const tab=event.target.closest('[data-marketing-tab]');
    if(tab){choose(tab.dataset.marketingTab);return;}
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
