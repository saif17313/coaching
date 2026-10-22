import {admissionId} from './student-admission.mjs';
const textKeys=['receiptNumber','paymentId','studentId','studentName','admissionRoll','batchName','billPeriod','chargeLabel','currency','method','reference','paidAt','issuerName','issuedAt'];
const moneyKeys=['paymentMinor','chargeMinor','paidMinor','waivedMinor','refundedMinor','correctionMinor','balanceMinor'];
export function validateReceipt(value){
 const s=value?.snapshot;
 if(!s||s.version!==1||typeof s.demo!=='boolean'||Object.keys(s).filter(k=>k!=='className').sort().join(',')!==[...textKeys,...moneyKeys,'version','demo'].sort().join(',')||textKeys.some(k=>typeof s[k]!=='string'||s[k].length>200||/[\u0000-\u001f]/.test(s[k]))||moneyKeys.some(k=>typeof s[k]!=='string'||!(/^-?\d{1,18}$/).test(s[k]))||s.currency!=='BDT'||!/^EC-[A-F0-9]{32}$/.test(s.receiptNumber)||!Array.isArray(value.adjustments)||value.adjustments.length>1000)throw Error('INVALID_RECEIPT');
 if(!admissionId(s.paymentId)||!admissionId(s.studentId)||!Number.isFinite(Date.parse(s.paidAt))||!Number.isFinite(Date.parse(s.issuedAt))||moneyKeys.some(k=>k!=='correctionMinor'&&BigInt(s[k])<0n)||BigInt(s.paymentMinor)<=0n||BigInt(s.paymentMinor)>BigInt(s.paidMinor))throw Error('INVALID_RECEIPT');
 const computed=BigInt(s.chargeMinor)-BigInt(s.paidMinor)-BigInt(s.waivedMinor)+BigInt(s.refundedMinor)-BigInt(s.correctionMinor);if(BigInt(s.balanceMinor)!==(computed>0n?computed:0n))throw Error('INVALID_RECEIPT');
 if(s.className!==undefined&&(typeof s.className!=='string'||s.className.length>80||/[\u0000-\u001f]/.test(s.className)))throw Error('INVALID_RECEIPT');
 if(value.adjustments.some(a=>!a||!['waiver','refund','correction'].includes(a.kind)||typeof a.amountMinor!=='string'||!(/^-?\d{1,18}$/).test(a.amountMinor)||typeof a.reason!=='string'||a.reason.length>500||typeof a.recordedAt!=='string'))throw Error('INVALID_RECEIPT');
 return value;
}
