import test from 'node:test';
import assert from 'node:assert/strict';
import { mapEvent, formatUsage } from '../bridge.mjs';
import { wantsPet } from '../auto-bridge.mjs';

test('only public assistant messages are displayed',()=>{
  assert.equal(mapEvent({type:'response_item',payload:{type:'reasoning',text:'private'}}),null);
  assert.equal(mapEvent({type:'response_item',payload:{type:'message',role:'user',content:[{type:'text',text:'private'}]}}),null);
  const final=mapEvent({type:'response_item',payload:{type:'message',role:'assistant',phase:'final',content:[{type:'output_text',text:'完成'}]}});
  assert.equal(final.state,'success');assert.equal(final.text,'完成');assert.equal(final.done,true);
});
test('quota is remaining usage, not consumed usage or credit balance',()=>{
  assert.match(formatUsage([{limit_id:'codex',primary:{used_percent:7,window_minutes:10080,resets_at:1793513751}}],'2026-10-25T15:50:00Z'),/周额度：剩余 93%/);
  assert.match(formatUsage([{primary:{used_percent:110,window_minutes:300}}]),/剩余 0%/);
  assert.match(formatUsage([],null),/暂不可用/);
  assert.doesNotMatch(formatUsage([{primary:null,credits:{balance:'0'}}]),/剩余 100%/);
});
test('automatic launch requires Codex and its visible-pet switch',()=>{
  assert.equal(wantsPet({'electron-avatar-overlay-open':true},true),true);
  assert.equal(wantsPet({'electron-avatar-overlay-open':true},false),false);
  assert.equal(wantsPet({'electron-avatar-overlay-open':false},true),false);
});
