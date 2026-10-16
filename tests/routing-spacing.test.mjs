import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {adminPaths,adminView} from '../lib/admin-routes.ts';
const require=createRequire(import.meta.url),postcss=require('postcss');
const root=new URL('../',import.meta.url);
test('all administrator screens have real leaf routes and the active screen comes from the URL',async()=>{
 const names={products:'san-pham',images:'thu-vien',content:'noi-dung',setup:'cai-dat',automation:'automation',categories:'categories'};
 for(const [view,path] of Object.entries(names)){assert.equal(adminView('/'+path+'/'),view);assert.equal(adminView('/'+path),view);assert.equal(adminPaths[view],'/'+path+'/');await readFile(new URL(`app/(admin)/${path}/page.tsx`,root),'utf8');}
 const state=await readFile(new URL('components/admin-workspace-state.tsx',root),'utf8');assert.ok(!state.includes('setView'));assert.ok(state.includes('usePathname'));assert.ok(state.includes('router.push(adminPaths[next])'));
 const shell=await readFile(new URL('components/admin-shell.tsx',root),'utf8');assert.equal((shell.match(/aria-current=\{view===/g)||[]).length,6);assert.ok(shell.includes('href={adminPaths.products}'));
 const layout=await readFile(new URL('app/(admin)/layout.tsx',root),'utf8');assert.ok(layout.includes('<AdminLayout>{children}</AdminLayout>'));
 const provider=await readFile(new URL('components/admin-layout.tsx',root),'utf8');assert.ok(provider.includes('<AdminContext.Provider value={workspace}>'));assert.ok(provider.includes('<AdminShell>{children}</AdminShell>'));
});
test('root redirects to products and preserves OAuth results when redirecting to settings',async()=>{
 let source=await readFile(new URL('app/page.tsx',root),'utf8');source=source.replace(/import[^\n]+\n/,'const redirect=(location)=>{throw Object.assign(new Error("redirect"),{location});};\n');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {default:Home}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 await assert.rejects(Home({searchParams:Promise.resolve({})}),e=>e.location==='/san-pham/');
 await assert.rejects(Home({searchParams:Promise.resolve({facebook_result:'choose',threads_result:'connected'})}),e=>e.location==='/cai-dat/?facebook_result=choose&threads_result=connected');
});
test('existing colors, fonts, effects and layout declarations remain identical while spacing uses tokens',async()=>{
 const baseline=JSON.parse(await readFile(new URL('tests/fixtures/spacing-baseline.json',root),'utf8'));
 const spacing=/^(margin|padding)(-|$)|^(gap|row-gap|column-gap)$/;
 function nonSpacing(css){const result=[];postcss.parse(css).walkDecls(d=>{if(!spacing.test(d.prop))result.push([d.parent.selector||d.parent.name,d.prop,d.value,d.important||false]);});return result;}
 for(const [file,old] of Object.entries(baseline)){
 const current=await readFile(new URL(file,root),'utf8');assert.deepEqual(nonSpacing(current),nonSpacing(old),file+' changed non-spacing declarations');
 postcss.parse(current).walkDecls(d=>{if(spacing.test(d.prop))assert.ok(!/-?\d+(\.\d+)?px/.test(d.value),file+': '+d.prop+' contains raw px');});
 }
 const common=postcss.parse(await readFile(new URL('app/spacing.css',root),'utf8'));
 common.walkDecls(d=>assert.ok(!/^(color|background|font|border|box-shadow|animation|transition)/.test(d.prop),'spacing override changes '+d.prop));
});
