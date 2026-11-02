import test from 'node:test';import assert from 'node:assert/strict';import {metricDelta} from '../src/metric-style.js';
test('metric change chips are short, neutral and explain themselves',()=>{assert.equal(metricDelta(65,null),null);assert.equal(metricDelta(65,0),null);assert.deepEqual(metricDelta(65.3,65),{direction:'flat',label:'Steady',title:'Within 1% of your 30-day average'});assert.deepEqual(metricDelta(71,59),{direction:'up',label:'↑ 20%',title:'20% above your 30-day average'});assert.deepEqual(metricDelta(62,65),{direction:'down',label:'↓ 4.6%',title:'4.6% below your 30-day average'});});
test('dates use English with the reader\'s regional order',async()=>{const {dateLocale}=await import('../src/domain.js');assert.match(dateLocale,/^en(-|$)/);});
test('percentage and temperature signals change in points and degrees, not percent of a percent',()=>{
 assert.deepEqual(metricDelta(64,72,'%'),{direction:'down',label:'↓ 8 pts',title:'8 points below your 30-day average'});
 assert.equal(metricDelta(98.4,98,'%').label,'Steady');
 assert.deepEqual(metricDelta(33.8,33.5,'°C'),{direction:'up',label:'↑ 0.3 °C',title:'0.3 °C above your 30-day average'});
 assert.equal(metricDelta(33.55,33.5,'°C').label,'Steady');
 assert.equal(metricDelta(71,59,'ms').label,'↑ 20%');
});
