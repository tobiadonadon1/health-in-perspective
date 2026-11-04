import test from 'node:test';
import assert from 'node:assert/strict';
import {TOUR_CHAPTERS,sparkPath} from '../src/tour.js';

test('welcome film: six short chapters, each with a title and one line',()=>{
 assert.equal(TOUR_CHAPTERS.length,6);
 assert.equal(new Set(TOUR_CHAPTERS.map(c=>c.id)).size,6);
 for(const c of TOUR_CHAPTERS)assert.ok(c.eyebrow&&c.title.length<=40&&c.text.length<=100,c.id);
});
test('welcome film: sparklines start and end on the values and stay in their box',()=>{
 const d=sparkPath([1,3,2,5],{w:100,h:20,pad:2});
 assert.match(d,/^M2\.0 /);assert.ok(d.endsWith('98.0 2.0'));
 const ys=[...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(m=>Number(m[2]));assert.ok(ys.every(y=>y>=2&&y<=18));
 assert.equal(sparkPath([4]),'');assert.equal(sparkPath([2,2]).includes('NaN'),false);
});
