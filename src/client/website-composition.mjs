/** Shared presentation/editor contract. Definitions contain no operational content. */
export const HOME_SECTIONS=Object.freeze([
 {key:'HOME_HERO',label:'Hero',kind:'hero',source:'home',fields:['tagline','headline','highlightedText','description','teacherImage','features','primaryCtaLabel','primaryCtaUrl','secondaryCtaLabel','secondaryCtaUrl']},
 {key:'HOME_STATS',label:'Hero statistics',kind:'cards',source:'home',fields:['stats']},
 {key:'HOME_FEATURED_COURSES',label:'Courses',kind:'courses',source:'courses',selection:'selectedCourseIds',catalog:'COURSES_CARDS',fields:['selectedCourseIds']},
 {key:'HOME_WHY_CHOOSE',label:'Classroom benefits',kind:'cards',source:'about',fields:['eyebrow','heading','highlightedText','description','benefits','trustItems']},
 {key:'HOME_TEACHER',label:'Teaching philosophy / mentor',kind:'rich-text',source:'about',fields:['teacherName','teacherTitle','teacherSubtitle','teacherBio','teacherImage','teachingMethods']},
 {key:'HOME_TOP_STUDENTS',label:'Achievements',kind:'results',source:'home',fields:['header','months']},
 {key:'HOME_STUDENT_SUCCESS',label:'Student results',kind:'results',source:'results',selection:'selectedStudentIds',catalog:'RESULTS_STUDENTS',fields:['selectedStudentIds']},
 {key:'HOME_YOUTUBE_CLASSES',label:'Video classes',kind:'cards',source:'home',fields:['header','classes']},
 {key:'HOME_TESTIMONIALS',label:'Student reviews',kind:'reviews',source:'reviews',selection:'selectedTestimonialIds',catalog:'REVIEWS_ITEMS',fields:['selectedTestimonialIds']},
 {key:'HOME_NEWS_EVENTS',label:'News and events',kind:'news',source:'news-events',selection:'selectedRightIds',catalog:'NEWS_EVENTS_ITEMS',fields:['featuredId','selectedRightIds']},
 {key:'HOME_GALLERY',label:'Gallery',kind:'gallery',source:'gallery',selection:'selectedAlbumIds',catalog:'GALLERY_ALBUMS',fields:['selectedAlbumIds']},
 {key:'GLOBAL_FOOTER',label:'Footer and navigation',kind:'footer',source:'home',fields:['description','copyrightText','socialLinks','links']}
]);
const ordered=p=>(p?.sections??[]).slice().sort((a,b)=>a.order-b.order);
export function resolveHomeSection(key,home,related={}){
 const spec=HOME_SECTIONS.find(x=>x.key===key);if(!spec)return null;
 const own=ordered(home).find(s=>s.sectionKey===key);
 const source=spec.source==='home'?home:related[spec.source];
 const legacy=(spec.catalog?ordered(source).find(s=>s.sectionKey===spec.catalog):undefined)??ordered(source).find(s=>s.kind===spec.kind&&!s.sectionKey);
 const section=own??(key==='HOME_YOUTUBE_CLASSES'||key==='HOME_TOP_STUDENTS'||key==='GLOBAL_FOOTER'?null:legacy);
 const selected=own&&spec.selection;
 return {...spec,section,sourceSlug:own?'home':spec.source,selectionSection:selected?own:null,catalogSection:spec.selection?legacy:null,catalogSlug:spec.selection?spec.source:null,available:Boolean(section),mode:selected?'selection':own?'dedicated':section?'shared legacy':'not configured'};
}
export function homeSectionMap(home,related={}){return HOME_SECTIONS.map(s=>resolveHomeSection(s.key,home,related));}
