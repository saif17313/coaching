/** Presentation-only grouping. Never changes the reviewed Supabase CMS field contract. */
const configurations={
 HOME_HERO:[['Introduction','tagline','headline','highlightedText','description'],['Educator and photograph','teacherName','teacherTitle','teacherSubtitle','teacherImage'],['Learning features','features'],['Primary and secondary buttons','primaryCtaLabel','primaryCtaUrl','secondaryCtaLabel','secondaryCtaUrl'],['Motion preference','enableMotion']],
 HOME_WHY_CHOOSE:[['Section introduction','eyebrow','heading','highlightedText','description'],['Learning benefits','benefits'],['Trust statements','trustItems']],
 HOME_TEACHER:[['Teacher identity','teacherName','teacherTitle','teacherSubtitle','teacherSpecialty'],['Biography and portrait','teacherBio','teacherImage'],['Teaching methods','teachingMethods']],
 HOME_STATS:[['Statistics','stats']],
 HOME_TOP_STUDENTS:[['Section title','header'],['Achievement periods','months']],
 HOME_YOUTUBE_CLASSES:[['Section title','header'],['YouTube classes','classes']],
 CONTACT_INFO:[['Location and visitor information','address','transitInfo','securityInfo'],['Map and directions','mapEmbedUrl','mapDirectionUrl'],['Contact methods','phone','email','socialLinks']],
 CONTACT_FAQ:[['Frequently asked questions','faqs']],
 GLOBAL_FOOTER:[['Identity and copyright','description','copyrightText'],['Social media','socialLinks'],['Navigation links','links']],
 ABOUT_HERO:[['Introduction','eyebrow','title','subtitle','description','highlightedText','greeting','quote'],['Teacher profile','name','role','organization','summary','email','phone','location','imageUrl'],['Trust and social links','heroStats','socialLinks']],
};
const itemConfigurations={
 COURSES_CARDS:[['Class and duration','duration','examType','target','schedule'],['What students receive','features']],
 RESULTS_STUDENTS:[['Achievement details','achievement','examType','year','institution'],['Verification and demo label','verified','demo']],
 REVIEWS_ITEMS:[['Testimonial author','author','rating'],['Publication authorization','approved','consent','demo']],
 GALLERY_ALBUMS:[['Album details','category','date'],['Photos and videos','images','videoUrl']],
 NEWS_EVENTS_ITEMS:[['Event information','category','date','month','time','location'],['Article content','excerpt','fullContent'],['Featured status','isFeatured']],
 MATERIALS_ITEMS:[['Resource details','category','fileType','fileUrl'],['Access','access']],
 CALENDAR_CARD:[['Schedule','date','day','startTime','endTime','subject','room']],
 ROUTINE_CARD:[['Schedule','date','day','startTime','endTime','subject','room']],
};
/** Return every form field exactly once; future schema extensions appear in Additional details. */
export function cmsFieldGroups(key,properties,item=false){
 const fields=Object.keys(properties??{}),sections=(item?itemConfigurations:configurations)[key]??[],used=new Set(),groups=[];
 for(const [label,...keys] of sections){const available=keys.filter(name=>fields.includes(name)&&!used.has(name));if(available.length){available.forEach(name=>used.add(name));groups.push({label,keys:available});}}
 const rest=fields.filter(name=>!used.has(name));if(rest.length)groups.push({label:groups.length?'Additional details':'Content details',keys:rest});
 return groups;
}
