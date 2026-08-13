import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const inputRoot=process.cwd();
const outputRoot=path.resolve(inputRoot,'..','output');
const sourcePath=path.join(outputRoot,'src','concurrent_link.spec.mjs');
const reportRoot=path.join(outputRoot,'reports');
const evidenceRoot=path.join(outputRoot,'evidence','screenshots');
const requiredReports=['session_results.csv','event_timeline.csv','link_requests.csv','slot_snapshot.csv','link_control.json'];
const assert=(value,message)=>{if(!value)throw new Error(message)};
async function files(root,current=root){const result=[];for(const entry of(await fs.readdir(current,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const full=path.join(current,entry.name);if(entry.isDirectory())result.push(...await files(root,full));else if(entry.isFile())result.push(path.relative(root,full).split(path.sep).join('/'))}return result}
async function clean(){await fs.rm(reportRoot,{recursive:true,force:true});await fs.rm(path.join(outputRoot,'evidence'),{recursive:true,force:true})}
function execute(){return spawnSync(process.execPath,[sourcePath],{cwd:inputRoot,encoding:'utf8',timeout:90000,windowsHide:true,env:{...process.env,PW_CHANNEL:process.env.PW_CHANNEL||'chrome'}})}

try{
  assert(path.basename(inputRoot)==='input_data','请在input_data目录执行npm run process');
  await clean();
  const source=await fs.readFile(sourcePath,'utf8');
  assert(!source.includes('TODO'),'业务脚本仍含TODO');
  assert(source.includes("from '../../input_data/node_modules/playwright/index.mjs'")||source.includes('from "../../input_data/node_modules/playwright/index.mjs"'),'业务脚本必须加载输入包内Playwright');
  assert(/chromium\.launch/u.test(source)&&/newContext/u.test(source),'业务脚本必须启动真实浏览器并隔离context');
  assert(/waitForEvent\(['"]page['"]\)/u.test(source)&&/getByRole/u.test(source),'业务脚本必须通过可访问角色打开双槽弹窗');
  for(const name of requiredReports)assert(source.includes(name),`业务脚本未声明报告:${name}`);
  const cases=JSON.parse(await fs.readFile(path.join(inputRoot,'fixtures','concurrent_link_cases.json'),'utf8'));
  const contract=JSON.parse(await fs.readFile(path.join(inputRoot,'rules','concurrent_link_contract.json'),'utf8'));
  assert(Array.isArray(cases)&&cases.length===6,'并发场景应为6条');
  assert(new Set(cases.map(item=>item.scenario_id)).size===cases.length,'scenario_id必须唯一');
  for(const id of cases.map(item=>item.scenario_id))assert(!source.includes(id),`业务脚本不得按场景ID硬编码:${id}`);
  assert(JSON.stringify(contract.slots)==='["billing","support"]','槽位合同错误');
  const result=execute();assert(result.status===0,`业务脚本执行失败:${result.stdout}${result.stderr}`);for(const name of requiredReports){const stat=await fs.stat(path.join(reportRoot,name));assert(stat.isFile()&&stat.size>0,`缺少报告:${name}`)}const screenshots=(await fs.readdir(evidenceRoot)).filter(name=>name.endsWith('.png')).sort();assert(screenshots.length===cases.length,'截图数量与场景数不一致');for(const name of screenshots){const bytes=await fs.readFile(path.join(evidenceRoot,name));assert(bytes.length>5000&&bytes.subarray(1,4).toString('ascii')==='PNG',`截图不可读:${name}`)}const control=JSON.parse(await fs.readFile(path.join(reportRoot,'link_control.json'),'utf8'));assert(control.result==='PASS'&&Object.values(control.invariants).every(Boolean),'账号绑定控制记录未闭合');console.log(JSON.stringify({result:'PASS',browser:'Playwright',slot_model:'billing+support',scenarios:cases.length}));
}catch(error){await clean();console.error(error instanceof Error?error.message:String(error));process.exitCode=1}
