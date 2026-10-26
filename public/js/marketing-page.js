// The marketing workspace is composed from real Cerium data, not simulated AI
// metrics. Campaign writing happens in the browser and requires human review.
import {marketingInsights,draftMarketingCopy,marketingFollowUp} from './marketing-model.js';
import {escapeHTML as esc} from './workspace-model.js';
import {businessLocalDate} from './us-market.js';
import {MARKETING_FEATURE_TABS,marketingFeatureFromHash} from './marketing-features.js';
export {MARKETING_FEATURE_TABS} from './marketing-features.js';

const arrow='<span aria-hidden="true">→</span>';
const navLink=(hash,label)=>'<a href="#'+hash+'" data-nav="'+hash+'" class="text-button marketing-link">'+esc(label)+' '+arrow+'</a>';
const tabs=MARKETING_FEATURE_TABS;
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
    '<button type="button" class="button secondary marketing-light-button" data-marketing-followup="'+index+'">Plan check-in '+arrow+'</button></div>'
  ).join(''):'<div class="marketing-empty marketing-empty-action"><span class="marketing-empty-mark" aria-hidden="true">↗</span><strong>No check-ins to suggest just yet</strong><span>This list uses paid invoices older than 30 days and excludes customers who already have an open follow-up.</span></div>';
  const priorities=data.priorities.slice(0,3).map((item,index)=>
    '<div class="marketing-priority"><span class="marketing-priority-index">0'+(index+1)+'</span><div><strong>'+esc(item.title)+'</strong><p>'+esc(item.reason)+'</p></div></div>').join('');
  const stat=(label,count,details)=>'<div class="marketing-stat"><span>'+esc(label)+'</span><strong>'+esc(count)+'</strong><small>'+esc(details)+'</small></div>';
  return '<section class="marketing-page" data-marketing-page>'+
    '<div class="page-heading marketing-page-heading"><div>'+
      '<p class="eyebrow">GROW YOUR BUSINESS</p>'+
      '<h1>Marketing</h1>'+
      '<p class="page-description">Get discovered, reconnect with customers, and review activity recorded in Cerium.</p>'+
      '</div><div class="heading-actions marketing-heading-actions">'+
      '<a class="button secondary" href="#reviews" data-nav="reviews">Reviews</a>'+
      '<button type="button" class="button primary" data-marketing-jump="visibility">Create a message</button>'+
      '</div></div>'+
    '<div class="marketing-layout">'+
      '<nav class="marketing-switcher" role="tablist" aria-label="Marketing features">'+
        tabs.map((item,index)=>'<button type="button" role="tab" id="marketing-tab-'+item.key+'" class="marketing-tab'+(index===0?' active':'')+'" data-marketing-tab="'+item.key+'" aria-controls="marketing-panel-'+item.key+'" aria-selected="'+(index===0?'true':'false')+'" tabindex="'+(index===0?'0':'-1')+'" title="'+esc(item.label)+'">'+
          '<span class="marketing-tab-number">'+String(index+1).padStart(2,'0')+'</span><span class="marketing-tab-copy"><strong>'+esc(item.label)+'</strong></span>'+
        '</button>').join('')+
      '</nav>'+
      '<div class="panel marketing-main">'+
    '<section role="tabpanel" tabindex="0" id="marketing-panel-visibility" aria-labelledby="marketing-tab-visibility" data-marketing-panel="visibility">'+
      '<div class="panel-header marketing-feature-header"><div>'+
        '<div class="panel-title"><svg class="icon" aria-hidden="true"><use href="#i-reviews"></use></svg><h2>Get found and chosen</h2></div>'+
        '<p class="panel-subtitle">Create messages and manage review requests. Nothing is published or sent automatically.</p></div>'+
        '<div class="marketing-panel-links">'+navLink('reviews','Review requests')+navLink('leads','Your enquiries')+'</div>'+
      '</div><div class="panel-body marketing-feature-body">'+
      '<div class="marketing-feature-grid"><div class="marketing-composer">'+
        '<div class="marketing-composer-title"><div><h3>Message draft</h3><p>Start with a suggestion, edit the text and choose when to share it.</p></div><span class="badge marketing-draft-badge">Draft only</span></div>'+
        '<div class="marketing-fields form-grid"><label class="field">Message type<select data-marketing-draft-kind>'+
          '<option value="post">Social post</option><option value="update">Business profile update</option><option value="review">Review request</option><option value="rebook">Re-booking check-in</option></select></label>'+
          '<label class="field">What do you offer?<input data-marketing-service maxlength="100" value="'+esc(service)+'" placeholder="e.g. garden maintenance"></label></div>'+
        '<label class="field marketing-message-label">Message<textarea data-marketing-draft rows="6" maxlength="1600">'+esc(initial)+'</textarea></label>'+
        '<div class="marketing-composer-actions"><button type="button" class="button secondary marketing-light-button" data-marketing-generate>Regenerate draft</button><button type="button" class="button primary marketing-primary-button" data-marketing-copy>Copy draft</button></div>'+
        '<p class="marketing-fineprint" data-marketing-copy-status role="status">Review accuracy, permission and platform rules before sharing. No messages are sent automatically.</p>'+
      '</div><aside class="marketing-next-moves"><p class="eyebrow">SUGGESTED NEXT STEPS</p><h3>Recommended actions</h3>'+
        '<div class="marketing-priority-list">'+priorities+'</div>'+
        '<p class="marketing-aside-foot">Suggestions are based only on what you have recorded in Cerium.</p>'+
      '</aside></div></div>'+
    '</section>'+
    '<section role="tabpanel" tabindex="0" id="marketing-panel-reengage" aria-labelledby="marketing-tab-reengage" data-marketing-panel="reengage" hidden>'+
      '<div class="panel-header marketing-feature-header"><div>'+
        '<div class="panel-title"><svg class="icon" aria-hidden="true"><use href="#i-followups"></use></svg><h2>Re-book and re-engage</h2></div>'+
        '<p class="panel-subtitle">Review past customer relationships and plan a manual follow-up.</p></div>'+
        '<div class="marketing-panel-links">'+navLink('followups','All follow-ups')+navLink('invoices','Customer invoices')+'</div>'+
      '</div><div class="panel-body marketing-feature-body">'+
      '<div class="marketing-relationship-summary"><div><span class="eyebrow">RE-ENGAGEMENT OPPORTUNITIES</span><strong>'+data.candidates.length+'</strong><small>suggested customers to review</small></div>'+
        '<p>Only customers with a paid invoice at least 30 days old and no open follow-up. This is not evidence of consent to marketing.</p></div>'+
      '<div class="marketing-list-heading"><h3>Consider checking in</h3><span>Human review required</span></div>'+
      '<div class="marketing-customer-list">'+candidates+'</div>'+
      '<p class="marketing-fineprint marketing-relationship-note">Plan check-in saves a task in Follow-ups. Verify the customer’s contact preferences before calling, texting, or emailing. No messages are sent automatically.</p></div>'+
    '</section>'+
    '<section role="tabpanel" tabindex="0" id="marketing-panel-performance" aria-labelledby="marketing-tab-performance" data-marketing-panel="performance" hidden>'+
      '<div class="panel-header marketing-feature-header"><div>'+
        '<div class="panel-title"><svg class="icon" aria-hidden="true"><use href="#i-leads"></use></svg><h2>Track performance</h2></div>'+
        '<p class="panel-subtitle">Activity from saved leads, invoices, follow-ups and reviews—no invented marketing metrics.</p></div>'+
        '<div class="marketing-panel-links">'+navLink('leads','Review lead sources')+navLink('reviews','Customer feedback')+'</div>'+
      '</div><div class="panel-body marketing-feature-body">'+
      '<div class="marketing-insight-grid">'+
        stat('Leads marked Booked or Done',data.bookedLeads,'Of '+data.totalLeads+' recorded leads')+
        stat('Reviews marked received',data.reviewsReceived,'Of '+data.reviewRequests+' requested or received')+
        stat('Due follow-ups',data.dueFollowUps,'Outstanding tasks')+
        stat('Past paying customers',data.pastPaidCustomers,'Deduplicated by name')+
      '</div>'+
      '<section class="marketing-sources"><div class="marketing-list-heading"><h3>Where enquiries originate</h3><span>Based on lead source labels</span></div>'+sources+'</section>'+
      '<div class="notice marketing-callout"><span class="marketing-callout-mark" aria-hidden="true">i</span><div><strong>What we do not measure yet</strong><p>Cerium does not currently collect website visits, ad impressions, reach, campaign spend, published posts or attributed marketing revenue. We will not display made-up ROI or engagement metrics.</p></div></div>'+
      '</div>'+
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
  const deepLink=()=>marketingFeatureFromHash(location.hash)||tabs[0].key;
  choose(deepLink());
  const navigateTo=key=>{
    if(!tabs.some(t=>t.key===key))return;
    choose(key);
    // A shareable deep link without remounting the page or erasing an edited draft.
    const hash='#marketing/'+key;
    if(location.hash!==hash)history.replaceState(null,'',hash);
    page.querySelector('#marketing-tab-'+key)?.scrollIntoView?.({block:'nearest',inline:'nearest'});
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
