/** Explicitly authorized public sample content; signed Teacher RPCs, no service key. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {parseEnv,safeConfig} from './seed-hosted-cms.mjs';
import {isPlaceholderRecord,isPublishedSample,publicPageContent} from '../src/client/public-content-policy.mjs';
const apply=process.argv.includes('--apply');
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7);
const themes={
 gallery:['Learning together','Creative workshop','Community reading'],
 'news-events':['New learner orientation','Classroom learning update','Study skills workshop'],
 reviews:['Learning with clearer explanations','Finding a steady study rhythm','Building confidence through practice'],
 results:['From confusion to clear concepts','A consistent practice journey','Growing through feedback'],
 courses:['SSC science foundation','HSC physics','HSC higher mathematics','Admission revision'],
 projects:['Hands-on classroom experiments','Collaborative problem solving','Student research journal'],
 materials:['Physics formula revision','Higher mathematics practice','Exam preparation checklist'],
 'academic-calendar':['Enrollment planning','Term review milestone','Results review day'],
 'class-routine':['Physics concept session','Mathematics practice session','Weekly revision session'],
 about:['Concept-led learning','Purposeful independent practice','Constructive feedback'],
 home:['Clarity first','Stay on track','Progress with purpose']
};
const copy={
 gallery:'Original educational illustration showing shared learning. This is not a photograph of our students or campus.',
 'news-events':'Example announcement for previewing the news layout. This event is not scheduled; confirm actual dates with the coaching team.',
 reviews:'Fictional feedback example: clear explanations, regular practice and thoughtful feedback can make studying feel more manageable. This is not an actual student testimonial.',
 results:'Fictional learning journey: a learner breaks a difficult chapter into smaller goals, practises regularly and reviews mistakes. No actual student, score, rank or admission outcome is claimed.',
 courses:'Example learning programme with concept lessons, guided practice and revision. Availability, fees and admission dates must be confirmed with the coaching team.',
 projects:'Example educational activity exploring questions, discussing ideas and presenting a short learning reflection. This is not a report of a completed institutional project.',
 materials:'Example study resource outline for revision and self-checking. Ask the teacher for actual approved class materials.',
 'academic-calendar':'Example calendar milestone. Dates are intentionally unconfirmed and this is not an official academic schedule.',
 'class-routine':'Example routine entry. Day, time, room and teacher will be confirmed through the approved class schedule.',
 about:'Example teaching approach: explain the core idea, practise carefully and reflect on feedback. This is illustrative content rather than a claim about qualifications or publications.',
 home:'Example learning feature combining clear explanations, guided practice and purposeful revision.'
};
const report={target:'rkpwqgwceekuvlizfpeb',mode:apply?'apply':'plan',pages:[],media:[],status:'Pending'};
mkdirSync('docs/evidence/2026-10-22',{recursive:true});
const save=()=>writeFileSync('docs/evidence/2026-10-22/public-sample-seed.json',JSON.stringify(report,null,2)+'\n');
const {base,key}=safeConfig(parseEnv(readFileSync('.env.local','utf8')));
let token=key;
async function request(path,body,method='POST',extra={}){const r=await fetch(base+path,{method,headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...extra},...(body===undefined?{}:{body:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});const data=await r.json();if(!r.ok)throw Error(path.split('/').at(-1)+' HTTP '+r.status+' '+(data.code??data.error??''));return data;}
const rpc=(name,args={})=>request('/rest/v1/rpc/'+name,args);
const stable=name=>{const h=createHash('sha256').update('educentre-public-samples-v1:'+name).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);};
function illustration(label,index){const colors=[['#e4f4ec','#007f79'],['#e9eff8','#234b72'],['#fff2df','#9b6329']];const [bg,ink]=colors[index%3];return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><rect width="960" height="640" fill="${bg}"/><circle cx="770" cy="140" r="210" fill="${ink}" opacity=".08"/><circle cx="140" cy="600" r="250" fill="${ink}" opacity=".06"/><path d="M100 495 Q480 350 860 495" fill="none" stroke="${ink}" stroke-width="2" opacity=".2"/><g transform="translate(265 155)"><rect x="-15" y="10" width="460" height="305" rx="30" fill="${ink}" opacity=".1"/><path d="M210 65Q110 5 20 45V270Q110 230 210 285Q310 230 400 270V45Q310 5 210 65Z" fill="white" stroke="${ink}" stroke-width="8"/><path d="M210 65V285M65 100H160M65 140H160M65 180H140M260 100H355M260 140H355M260 180H335" fill="none" stroke="${ink}" stroke-width="8" stroke-linecap="round"/><circle cx="400" cy="40" r="44" fill="${ink}"/><path d="M381 40L395 53L420 27" fill="none" stroke="white" stroke-width="7" stroke-linecap="round"/></g><text x="55" y="65" fill="${ink}" font-family="sans-serif" font-size="19" font-weight="700" letter-spacing="4">EDUCENTRE / LEARNING STUDIO</text><text x="55" y="555" fill="${ink}" font-family="sans-serif" font-size="32" font-weight="700">${label.replaceAll('&','&amp;')}</text><text x="55" y="595" fill="${ink}" font-family="sans-serif" font-size="17">SAMPLE ILLUSTRATION / NOT AN ACTUAL CAMPUS PHOTO</text></svg>`;}
try{
 if(!apply){report.status='Plan';report.pages=Object.keys(themes);console.log('Plan: replace only disclosed legacy samples, preserve genuine content, upload original illustrations and publish through guarded Teacher RPCs.');save();process.exit(0);}
 const file=process.env.EDUCENTRE_TEST_CREDENTIAL_FILE;if(!file)throw Error('Local credential document required');const doc=readFileSync(file,'utf8'),email=doc.match(/Teacher:\s*`([^`]+)`/)?.[1],password=doc.match(/Shared test password:\s*`([^`]+)`/)?.[1];if(!email||!password)throw Error('Authorized Teacher credentials unavailable');
 const auth=await request('/auth/v1/token?grant_type=password',{email,password});token=auth.access_token;if(!token||!auth.user?.id)throw Error('Teacher sign-in failed');
 const pages=(await rpc('coaching_cms_list_pages')).items.filter(p=>p.status==='published');
 const drafts=[];for(const p of pages){const d=await rpc('coaching_cms_get_page',{p_page_id:p.id});if(d.draftRevision!==d.publishedRevision)throw Error('Unpublished edits exist on '+p.slug+'; refusing to publish unrelated work');drafts.push(d);}
 const existing=(await rpc('coaching_media_list')).items;
 const assets=[];mkdirSync('public/sample-media',{recursive:true});
 for(let n=0;n<3;n++){const label=['Concepts & curiosity','Practice & progress','Learning together'][n],alt='SAMPLE original learning illustration v1 '+(n+1)+' - not an actual campus photograph';let media=existing.find(m=>m.alt===alt&&m.status==='ready');const bytes=await sharp(Buffer.from(illustration(label,n))).png().toBuffer();writeFileSync('public/sample-media/learning-'+(n+1)+'.png',bytes);if(!media){const id=stable('media-'+n),storageKey=auth.user.id+'/'+id+'.png';await request('/storage/v1/object/musa-site-media/'+storageKey,bytes,'POST',{'Content-Type':'image/png','x-upsert':'false'});media=await rpc('coaching_media_register',{p_media_id:id,p_storage_key:storageKey,p_content_type:'image/png',p_size_bytes:bytes.length,p_sha256:createHash('sha256').update(bytes).digest('hex'),p_alt:alt,p_operation_id:randomUUID()});}assets.push(media.id);report.media.push({id:media.id,alt});save();}
 for(const d of drafts){if(!themes[d.slug]||only&&d.slug!==only)continue;let revision=d.draftRevision,changed=0;
  const write=async(action,target,data)=>{const r=await rpc('coaching_cms_write',{p_action:action,p_target:target,p_parent:d.id,p_expected_revision:revision,p_data:data,p_operation_id:randomUUID()});revision=r.revision;};
  for(const section of d.sections){if(section.kind==='hero'||section.kind==='faq'||section.kind==='cta')continue;let index=0;for(const item of section.items){if(!isPlaceholderRecord(item)&&!isPublishedSample(item))continue;const labels=themes[d.slug],title='[SAMPLE] '+labels[index%labels.length],description='Illustrative sample — '+copy[d.slug],mediaId=assets[index%3];index++;
    if(item.title!==title||item.description!==description)await write('item.upsert',item.id,{sectionId:section.id,order:item.order,title,description,url:item.url,visible:true});
    if(item.mediaId!==mediaId){const r=await rpc('coaching_cms_media_mutation',{p_action:'attach',p_media_id:mediaId,p_page_id:d.id,p_item_id:item.id,p_expected_revision:revision,p_operation_id:randomUUID()});revision=r.revision;}changed++;
  }}
  if(d.slug==='results'&&!d.sections.some(s=>s.heading==='Sample success stories')){const sectionId=stable('success-stories-section');await write('section.upsert',sectionId,{kind:'cards',order:Math.max(...d.sections.map(s=>s.order))+1,heading:'Sample success stories',body:'Fictional learning journeys for demonstration. These are not verified student achievements.',visible:true});for(let n=0;n<3;n++){const id=stable('success-story-'+n);await write('item.upsert',id,{sectionId,order:n,title:'[SAMPLE] '+themes.results[n],description:'Illustrative sample — '+copy.results,url:null,visible:true});const r=await rpc('coaching_cms_media_mutation',{p_action:'attach',p_media_id:assets[n],p_page_id:d.id,p_item_id:id,p_expected_revision:revision,p_operation_id:randomUUID()});revision=r.revision;changed++;}}
  if(revision!==d.draftRevision){await rpc('coaching_cms_write',{p_action:'page.publish',p_target:d.id,p_parent:null,p_expected_revision:revision,p_data:{},p_operation_id:randomUUID()});}
  const published=await rpc('coaching_cms_get_published_page',{p_slug:d.slug}),shown=publicPageContent(published),samples=shown.sections.flatMap(s=>s.items).filter(isPublishedSample);if(changed&&!samples.length)throw Error('Published sample filter failed: '+d.slug);report.pages.push({slug:d.slug,revision:published.revision,sampleCards:samples.length,withImages:samples.filter(i=>i.mediaId).length});save();console.log('Verified '+d.slug+': '+samples.length+' published sample records');
 }
 report.status='Pass';save();console.log('Public sample seed complete; genuine records preserved.');
}catch(error){report.status='Fail';report.failure=error.message;save();console.error(error.message);process.exitCode=1;}
