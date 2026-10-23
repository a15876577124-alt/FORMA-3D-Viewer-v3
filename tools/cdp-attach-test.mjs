import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {launchBrowser} from './browser-test.mjs';
const saved=process.env.FORMA_CDP_URL;delete process.env.FORMA_CDP_URL;
let owner,attached;
try{
 owner=await launchBrowser();const endpoint=new URL(owner.wsEndpoint());process.env.FORMA_CDP_URL='http://'+endpoint.host;
 attached=await launchBrowser();const page=await attached.newPage();
 await page.goto(process.env.FORMA_BASE+'/#/gallery?work=dan',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>window.__FORMA?.info?.modelTris===46828,{timeout:30000});
 const result=await page.evaluate(()=>({tris:window.__FORMA.info.modelTris,webgl:!!window.__FORMA.viewer.renderer.getContext()}));
 assert.equal(result.tris,46828);assert.equal(result.webgl,true);
 fs.writeFileSync(path.join(process.env.FORMA_TEST_OUTPUT_DIR,'report.json'),JSON.stringify({cdpAttach:true,...result},null,2));console.log('PASS: Puppeteer 25 CDP attach renders actual 46,828-triangle dan');
}finally{attached?.disconnect();await owner?.close();if(saved===undefined)delete process.env.FORMA_CDP_URL;else process.env.FORMA_CDP_URL=saved;}
