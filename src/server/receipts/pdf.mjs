import 'regenerator-runtime/runtime.js';
import {PDFDocument,rgb,degrees} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validateReceipt} from '../../client/payment-receipt.mjs';
export {validateReceipt} from '../../client/payment-receipt.mjs';
const localTime=value=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dhaka'}).format(new Date(value))+' (Bangladesh time)';
function money(value){const n=BigInt(value),abs=n<0n?-n:n;return (n<0n?'-':'')+(abs/100n).toLocaleString('en-US')+'.'+String(abs%100n).padStart(2,'0');}
export async function receiptPdf(value){
 const {snapshot:s,adjustments}=validateReceipt(value),doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(await readFile(join(process.cwd(),'public/fonts/NotoSansBengali.ttf')),{subset:true});
 doc.setTitle(s.demo?'SAMPLE EduCentre payment receipt': 'EduCentre payment receipt '+s.receiptNumber);doc.setAuthor('EduCentre');doc.setSubject('Verified payment; immutable issuance snapshot');doc.setCreationDate(new Date(s.issuedAt));
 const ink=rgb(.08,.19,.24),teal=rgb(.02,.40,.38),muted=rgb(.34,.42,.46);let page,y;
 function fresh(){page=doc.addPage([595.28,841.89]);y=785;page.drawRectangle({x:0,y:825,width:595.28,height:17,color:teal});if(s.demo)page.drawText('SAMPLE / DEMO',{x:80,y:360,size:44,font,color:rgb(.76,.84,.82),rotate:degrees(35),opacity:.40});}
 function line(text,size=10,color=ink){if(y<65)fresh();page.drawText(text,{x:44,y,size,font,color});y-=size+10;}
 function wrapped(text,size=10){let row='';for(const word of text.split(/\s+/)){if(font.widthOfTextAtSize(row+' '+word,size)>500&&row){line(row,size);row='';}if(font.widthOfTextAtSize(word,size)>500){for(const ch of word){if(font.widthOfTextAtSize(row+ch,size)>500){line(row,size);row='';}row+=ch;}}else row+=(row?' ':'')+word;}if(row)line(row,size);}
 fresh();const logo=await doc.embedPng(await readFile(join(process.cwd(),'public/brand/icon-192.png')));page.drawImage(logo,{x:483,y:744,width:64,height:64});line('EduCentre',25,teal);line('ACADEMIC CARE · STUDENT SUCCESS',9,muted);y-=12;line(s.demo?'SAMPLE PAYMENT RECEIPT':'PAYMENT RECEIPT',18);line(s.receiptNumber,10,muted);line('VERIFIED PAYMENT',10,teal);
 if(s.demo){y-=8;line('SAMPLE / DEMO — NOT A VALID PAYMENT RECEIPT',11,teal);}y-=12;
 for(const [label,content] of [['Student',s.studentName],['Admission roll',s.admissionRoll||s.studentId],['Class / batch',s.className?s.className+' - '+s.batchName:s.batchName],['Charge',s.chargeLabel+' · '+s.billPeriod],['Payment recorded',localTime(s.paidAt)],['Receipt issued',localTime(s.issuedAt)],['Collected / verified by',s.issuerName],['Method',s.method.replaceAll('_',' ')],['Transaction reference',s.reference||'Not supplied']])wrapped(label+': '+content);
 y-=12;line('PAYMENT RECEIVED   BDT '+money(s.paymentMinor),16,teal);y-=8;line('Previously paid   BDT '+money((BigInt(s.paidMinor)-BigInt(s.paymentMinor)).toString()),11);
 for(const [label,key] of [['Original charge','chargeMinor'],['Cumulative verified payments','paidMinor'],['Waivers','waivedMinor'],['Refunds','refundedMinor'],['Signed corrections','correctionMinor'],['Balance after this payment','balanceMinor']])line(label+'   BDT '+money(s[key]),11);
 y-=12;wrapped('The figures above are frozen ledger facts at the payment recording time. Later adjustments do not rewrite this receipt.',9);
 if(adjustments.length){y-=12;line('CORRECTION / ADJUSTMENT TRAIL AT DOWNLOAD',11,teal);for(const a of adjustments){wrapped(a.kind+' · BDT '+money(a.amountMinor)+' · '+a.recordedAt,9);wrapped(a.reason,9);}}
 y-=10;wrapped('System-issued record. Confirm payment identity and later ledger adjustments with EduCentre.',9);
 const pages=doc.getPages();for(let i=0;i<pages.length;i++)pages[i].drawText('EduCentre · '+s.receiptNumber+' · '+(i+1)+' / '+pages.length,{x:44,y:32,font,size:7,color:muted});
 return doc.save();
}
