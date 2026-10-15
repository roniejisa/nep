import assert from 'node:assert/strict';
import {test} from 'node:test';
import {metaRequest} from '../lib/social-publish.ts';
import {OperationError,explainError} from '../lib/operation-error.ts';
test('Meta token errors preserve HTTP/code/subcode without saving provider messages or tokens',async()=>{
 let error;try{await metaRequest('https://graph.facebook.com/v26.0/me','not-a-real-secret',undefined,async()=>Response.json({error:{code:190,error_subcode:463,message:'private token not-a-real-secret'}},{status:400}));}catch(e){error=e;}
 assert.ok(error instanceof OperationError);
 const log=explainError(new Error('Publish failed',{cause:error}),'publish');
 assert.equal(log.kind,'token');assert.equal(log.http_status,400);assert.equal(log.error_code,190);assert.equal(log.error_subcode,463);assert.ok(log.advice.includes('kết nối lại'));assert.ok(!JSON.stringify(error).includes('not-a-real-secret'));
});
test('permissions, quota and transport failures remain distinct; unknown errors are not labelled token errors',async()=>{
 for(const [code,kind] of [[200,'permission'],[613,'rate_limit'],[100,'meta']])await assert.rejects(metaRequest('https://graph.facebook.com/v26.0/me','secret',undefined,async()=>Response.json({error:{code}},{status:400})),e=>e.kind===kind);
 await assert.rejects(metaRequest('https://example.com','secret',undefined,async()=>{throw new Error('secret URL');}),e=>e.kind==='network'&&!e.message.includes('secret URL'));
 assert.equal(explainError(new Error('unknown'),'publish').kind,'unknown');
 const redacted=explainError(new Error('access_token=abc secret=def https://example.com/?token=abc'),'publish');assert.ok(!redacted.message.includes('abc'));assert.ok(!redacted.message.includes('def'));assert.ok(!redacted.message.includes('https://'));
});
