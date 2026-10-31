import test from 'node:test';import assert from 'node:assert/strict';
import {demoReadings,demoMeals,demoJournal,sampleMeals,sampleJournal,isSample,DEMO_SOURCE} from '../src/demo.js';
import {moodSection} from '../src/journal.js';
import {totals,localDay} from '../src/domain.js';
const now=new Date('2026-10-31T12:00:00').getTime(),today=localDay(new Date(now));

test('Journal and Home read the same sample check-ins in sample mode',()=>{
 const shown=sampleJournal(true,[],now);
 assert.deepEqual(shown,demoJournal(now),'the Journal gets the same rows Home\'s "Your week" uses');
 assert.ok(shown.length>=3&&shown.every(isSample));
 const card=moodSection(shown,demoReadings(now));
 assert.doesNotMatch(card,/0 of 3/,'"Mood and your body" is filled, not empty');
 assert.match(card,/mood-table/);
 assert.match(card,new RegExp(`· ${shown.filter(e=>e.mood).length} check-ins`));
});

test('sample check-ins never replace or mix with real ones, and stay off outside sample mode',()=>{
 const own=[{id:'a',logged_on:today,mood:'good',content:'Mine'}];
 assert.equal(sampleJournal(true,own,now),own);
 assert.deepEqual(sampleJournal(false,[],now),[]);
 assert.match(moodSection([],[]),/0 of 3/);
});

test('Nutrition shows the same sample meals and calories as Home',()=>{
 const home=sampleMeals(true,[],{now}),nutrition=sampleMeals(true,[],{day:today,today,now});
 assert.deepEqual(nutrition,home);
 assert.deepEqual(nutrition,demoMeals(now));
 assert.equal(Math.round(totals(nutrition).calories),1500);
 assert.ok(nutrition.length>0&&nutrition.every(m=>m.source===DEMO_SOURCE));
});

test('sample meals only fill an empty today, in sample mode',()=>{
 const own=[{id:'m',name:'Toast',calories:100,protein:3,carbs:18,fat:1}];
 assert.equal(sampleMeals(true,own,{day:today,today,now}),own,'real meals win');
 assert.deepEqual(sampleMeals(false,[],{day:today,today,now}),[]);
 assert.deepEqual(sampleMeals(true,[],{day:'2026-10-20',today,now}),[],'the sample meals are today\'s only');
});
