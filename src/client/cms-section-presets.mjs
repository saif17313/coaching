/** Editorial presets: UX-only composition aids. Never add properties absent from reviewed CMS DTO. */
export const SECTION_PRESETS=Object.freeze([
 {kind:'hero',label:'Hero / welcome',heading:'Welcome to our learning community',hint:'Use the first content item with an attached image for the hero portrait. HTTPS-linked items become call-to-action buttons.'},
 {kind:'cards',label:'Highlights / reasons',heading:'Why learn with us',hint:'Create a content item for each highlight; titles, paragraphs and uploaded photos are separately editable.'},
 {kind:'courses',label:'Courses & batches',heading:'Explore the courses',hint:'Each item becomes a course card with optional photo and HTTPS link.'},
 {kind:'gallery',label:'Photo gallery',heading:'Life in our classroom',hint:'Each visible item becomes a gallery tile. Attach verified images in the editor.'},
 {kind:'results',label:'Student achievements',heading:'Celebrating success',hint:'Add an achievement for each student or result, with descriptive text and optional image.'},
 {kind:'reviews',label:'Testimonials',heading:'What our students say',hint:'Use the item title for attribution and description for the testimonial quote.'},
 {kind:'faq',label:'Frequently asked questions',heading:'Questions and answers',hint:'Use each item title for the question and the description for its answer.'},
 {kind:'news',label:'News and events',heading:'Latest updates',hint:'Each item is a dated or editorial announcement with a title, description and optional image.'},
 {kind:'academic-calendar',label:'Academic calendar',heading:'Dates to remember',hint:'Use items for events; the item description can include the event date. No automated calendar synchronization is implied.'},
 {kind:'routine',label:'Class routine',heading:'Weekly class routine',hint:'Add an item per class schedule. This is CMS copy, not an automatic sync with student routines.'},
 {kind:'materials',label:'Public materials',heading:'Resources for learners',hint:'Provide public links for freely available resources. Do not expose private student files.'},
 {kind:'contact',label:'Contact information',heading:'Connect with us',hint:'Global email and phone are managed separately under Settings.'},
 {kind:'cta',label:'Call to action',heading:'Ready to get started?',hint:'Create HTTPS-linked items to display prominent action buttons.'},
 {kind:'rich-text',label:'About / biography',heading:'Our story',hint:'Use the main paragraph for a story or biography, and items for qualifications or details.'},
 {kind:'footer',label:'Additional links',heading:'Useful links',hint:'Linked items display as footer-style pills above the global footer.'}
]);
export function sectionPreset(kind){return SECTION_PRESETS.find(x=>x.kind===kind)??null;}
export function cmsEditorialAudit(page){
 if(!page||!Array.isArray(page.sections))return {checks:[],score:0};
 const visible=page.sections.filter(s=>s?.visible);
 const checks=[
  {key:'structure',label:'At least one visible section',ok:visible.length>0},
  {key:'title',label:'Search title and description are present',ok:typeof page.seoTitle==='string'&&page.seoTitle.trim().length>=2&&typeof page.seoDescription==='string'&&page.seoDescription.trim().length>=20},
  {key:'headline',label:'Every visible section has a heading',ok:visible.every(s=>typeof s.heading==='string'&&s.heading.trim().length>0)},
  {key:'content',label:'All visible non-text sections have content items',ok:visible.every(s=>['hero','rich-text','cta','contact','footer'].includes(s.kind)||s.items?.some(i=>i.visible))}
 ];
 return {checks,score:checks.filter(c=>c.ok).length};
}
