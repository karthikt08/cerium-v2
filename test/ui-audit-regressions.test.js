import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE} from './helpers.js';

test('review records and request dates use the business day at the UTC boundary',async context=>{
  const t=await startServer();try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});
    const user=t.db.getUserByEmail(ALICE.email);t.db.updateUser(user.id,{timeZone:'America/Los_Angeles'});
    context.mock.timers.enable({apis:['Date'],now:new Date('2026-10-27T01:30:00Z')});
    const review=t.db.createReview(user.id,{customerName:'Review customer',jobTitle:'Completed service'});
    let saved=t.db.getWorkspace(user.id).reviews.find(r=>r.id===review.id);
    assert.equal(saved.completedDate,'2026-10-26');assert.equal(saved.lastSentAt,'2026-10-26');
    context.mock.timers.setTime(new Date('2026-10-28T01:30:00Z').getTime());
    t.db.sendReviewRequest(user.id,review.id);saved=t.db.getWorkspace(user.id).reviews.find(r=>r.id===review.id);
    assert.equal(saved.lastSentAt,'2026-10-27');assert.equal(saved.completedDate,'2026-10-26');
  }finally{context.mock.timers.reset();await t.close();}
});
