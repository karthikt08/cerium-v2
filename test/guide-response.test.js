import {test} from 'node:test';
import assert from 'node:assert/strict';
import {guideReplyBlocks,MAX_GUIDE_REPLY} from '../public/js/guide-response.js';
import {resolveGuideQuestion,conciseGuideResponse} from '../public/js/guide-dialogue.js';
import {pickGuide} from '../public/js/guide-knowledge.js';
import {answerGuide} from '../server/guide-assistant.js';
import {startServer,signIn,ALICE} from './helpers.js';

test('paragraph answers become points, explicit numbered answers retain their order',()=>{
  assert.deepEqual(guideReplyBlocks({reply:'Open Invoices. Preview the document. Save the PDF.'}),[
    {type:'ul',items:['Open Invoices.','Preview the document.','Save the PDF.']}
  ]);
  assert.deepEqual(guideReplyBlocks({source:'ai',reply:'1. **Open** Invoices.\n2. Preview the document.\n3. Save the PDF.'}),[
    {type:'ol',items:['**Open** Invoices.','Preview the document.','Save the PDF.']}
  ]);
  assert.deepEqual(guideReplyBlocks({reply:'- Check ₹20.50.\n- Check UPI.'}),[
    {type:'ul',items:['Check ₹20.50.','Check UPI.']}
  ]);
});

test('greetings stay conversational and formatting is bounded, text-only data',()=>{
  assert.deepEqual(guideReplyBlocks({type:'conversation',kind:'greeting',reply:'Hello! How can I help?'}),[
    {type:'p',items:['Hello! How can I help?']}
  ]);
  const blocks=guideReplyBlocks({reply:'- [Open invoice](javascript:alert(1))\n- <img src=x onerror=alert(1)>'});
  assert.equal(blocks[0].type,'ul');
  assert.doesNotMatch(blocks[0].items[0],/javascript/);
  assert.match(blocks[0].items[1],/<img/,'HTML remains inert text for the renderer');
  assert.equal(guideReplyBlocks({reply:'x'.repeat(4000)})[0].items[0].length,MAX_GUIDE_REPLY);
});

test('specific PDF steps operate on an existing invoice, with no create-new detour',()=>{
  const result=conciseGuideResponse('How do I save an invoice PDF?',pickGuide('invoice PDF'));
  assert.doesNotMatch(result.steps,/New invoice|Create invoice/i);
  const steps=guideReplyBlocks(result,'How do I save an invoice PDF?').at(-1);
  assert.equal(steps.type,'ol');
  assert.equal(steps.items.length,4);
  assert.match(steps.items[1],/Preview/);
  assert.match(steps.items[3],/print dialog/);
});

test('model lists do not get a second generic execution sequence',()=>{
  const blocks=guideReplyBlocks({source:'ai',reply:'1. Open Invoices.\n2. Preview the saved invoice.',steps:'Open Invoices → New invoice → Save'},'How?');
  assert.equal(blocks.length,1);
  assert.equal(blocks[0].items.length,2);
});

test('short follow-ups retain the specific prior task and multi-page workflow',async()=>{
  const lastQuestion='How do I save an invoice PDF?';
  for(const question of ['Show me the steps','Tell me more','Explain that in detail','How do I do it?','Can you explain this step by step?','Steps please']){
    const result=await answerGuide(question,'settings',{provider:'guide',lastQuestion,lastSection:'invoices'});
    assert.equal(result.section,'invoices',question);
    assert.match(result.steps,/print dialog/i);
    assert.doesNotMatch(result.steps,/New invoice/);
  }
  const workflow='How do I convert an accepted quote into a scheduled job and invoice?';
  const followup=await answerGuide('Walk me through it','settings',{provider:'guide',lastQuestion:workflow});
  assert.deepEqual(followup.links.map(link=>link.href),['#quotes','#jobs','#invoices']);
  const numbered=guideReplyBlocks(followup,'Walk me through it').at(-1);
  assert.equal(numbered.items.length,3);
  assert.match(numbered.items[0],/approval/i);
});

test('new explicit topics override prior context and missing context prompts clarification',async()=>{
  assert.equal(resolveGuideQuestion('Where are my invoices?',{lastQuestion:'Import Excel'}),'Where are my invoices?');
  for(const lastQuestion of [null,{},'x'.repeat(421),'\u0000Import Excel','hello','frobnicate the platypus']){
    assert.equal(resolveGuideQuestion('Tell me more',{lastQuestion}),'Tell me more');
  }
  const unknown=await answerGuide('Tell me more','settings',{provider:'guide'});
  assert.equal(unknown.section,null);
  assert.match(unknown.reply,/Which part/);
  const newTask=await answerGuide('How do I change the scope of my quote?','settings',{provider:'guide',lastSection:'invoices',lastQuestion:'Where are my invoices?'});
  assert.equal(newTask.section,'quotes');
  const clarify=await answerGuide('How can I configure tax settings?','settings',{provider:'guide',lastSection:'invoices'});
  assert.equal(clarify.section,'settings');
});

test('specific task intent takes priority over generic module words',()=>{
  const undo=conciseGuideResponse('How do I undo match on a deposit?',pickGuide('undo match deposit'));
  assert.match(undo.reply,/Undo match/);
  const markup=conciseGuideResponse('How do I price a quote with markup?',pickGuide('quote markup'));
  assert.match(markup.reply,/labor hours and material costs/);
  const reschedule=conciseGuideResponse('Reschedule my crew appointment',pickGuide('reschedule crew appointment'));
  assert.match(reschedule.reply,/change the date/);
  assert.doesNotMatch(reschedule.steps,/Create job/);
  assert.equal(pickGuide('Draft a WhatsApp marketing message').section,'marketing');
  assert.equal(pickGuide('Send my quote on WhatsApp').section,'quotes');
});

test('shipped invoice sharing, UPI and no-GST guidance work with every provider',async()=>{
  for(const provider of ['guide','navlm','openai','ollama']){
    const options={provider,apiKey:'test-key',fetcher:async()=>{throw Error('Verified task must stay local');}};
    const share=await answerGuide('How do I share an invoice on WhatsApp?','overview',options);
    assert.equal(share.section,'invoices');
    assert.match(share.reply,/message draft/);
    assert.match(share.reply,/does not send it automatically/);
    const upi=await answerGuide('Where is the UPI QR code?','overview',options);
    assert.match(upi.reply,/Indian business.*INR/);
    assert.match(upi.reply,/verify receipt/);
    const gst=await answerGuide('Can I create an invoice without a GSTIN?','overview',options);
    assert.equal(gst.section,'invoices');
    assert.match(gst.reply,/without a GSTIN/);
    assert.match(gst.reply,/does not charge GST/);
    const registered=await answerGuide('I am not GST registered; can I create an invoice?','overview',options);
    assert.equal(registered.section,'invoices');
    assert.match(registered.reply,/Leave.*GSTIN blank/);
  }
});

test('provider receives bounded follow-up context and list instructions, without private records',async()=>{
  let payload;
  const result=await answerGuide('Explain that in detail','overview',{
    provider:'openai',apiKey:'test-key',lastQuestion:'How do I save an invoice PDF?',
    businessContext:{trade:'private-trade',customer:'private-customer'},
    fetcher:async(url,options)=>{
      payload=JSON.parse(options.body);
      return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'1. Open Invoices.\n2. Preview the document.\n3. Choose Print / save PDF.'}]}]})};
    }
  });
  assert.equal(result.source,'ai');
  assert.match(payload.input,/Previous task: How do I save an invoice PDF/);
  assert.match(payload.input,/Follow-up: Explain that in detail/);
  assert.match(payload.instructions,/bullet points.*numbered list/);
  assert.match(payload.instructions,/VERIFIED TASK GUIDANCE/);
  assert.doesNotMatch(JSON.stringify(payload),/private-trade|private-customer/);
  assert.equal(payload.store,false);
});

test('HTTP endpoint validates the prior task and resolves multi-page follow-ups',async()=>{
  const t=await startServer();
  try{
    const browser=t.browser();await signIn(t,browser,{profile:ALICE});
    const csrf=(await browser.me()).csrfToken;
    const post=async lastQuestion=>{
      const res=await browser.req('/api/assistant/message',{method:'POST',csrf,json:{question:'Show me the steps',currentSection:'settings',lastQuestion}});
      assert.equal(res.status,200);return res.json();
    };
    const followup=await post('How do I convert an accepted quote into a scheduled job and invoice?');
    assert.deepEqual(followup.links.map(link=>link.href),['#quotes','#jobs','#invoices']);
    for(const invalid of ['x'.repeat(421),{section:'invoices'},'\u0000Invoices']){
      const result=await post(invalid);assert.equal(result.section,null);assert.equal(result.kind,'clarify');
    }
  }finally{await t.close();}
});
