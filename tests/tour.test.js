import test from 'node:test';
import assert from 'node:assert/strict';
import {TOUR_STEPS,placeTip,unionRect} from '../src/tour.js';

test('tour: six short stops, each with a target, a title and one sentence or two',()=>{
 assert.equal(TOUR_STEPS.length,6);
 for(const s of TOUR_STEPS){assert.ok(s.targets.length&&s.title.length<40&&s.text.length<160,s.id)}
 assert.equal(new Set(TOUR_STEPS.map(s=>s.id)).size,6);
});
test('tour: the words sit below, above, beside, or pinned to the free edge, always inside the screen',()=>{
 const view={w:1440,h:900},size={bw:380,bh:220};
 assert.equal(placeTip({left:100,top:100,right:500,bottom:300,width:400,height:200},view,size).side,'below');
 assert.equal(placeTip({left:100,top:600,right:500,bottom:800,width:400,height:200},view,size).side,'above');
 assert.equal(placeTip({left:100,top:200,right:500,bottom:800,width:400,height:600},view,size).side,'right');
 const phone=placeTip({left:10,top:80,right:380,bottom:820,width:370,height:740},{w:390,h:844},{bw:366,bh:240});
 assert.equal(phone.side,'overlay');assert.ok(phone.x>=12&&phone.x+366<=390-12+0.5);assert.ok(phone.y>=12&&phone.y+240<=844);
 const edge=placeTip({left:1380,top:20,right:1430,bottom:60,width:50,height:40},view,size);
 assert.ok(edge.x+380<=1440-12);
});
test('tour: several cards are lit as one area',()=>{
 assert.deepEqual(unionRect([{left:10,top:20,right:110,bottom:120,width:100,height:100},{left:120,top:20,right:220,bottom:260,width:100,height:240},{left:0,top:0,right:0,bottom:0,width:0,height:0}]),{left:10,top:20,right:220,bottom:260,width:210,height:240});
 assert.equal(unionRect([]),null);
});
