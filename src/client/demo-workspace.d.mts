export type DemoStudent={id:string;name:string;roll:string;school:string;class:string;guardian:string;phone:string;email:string;address:string;status:string;admissionStatus:string;requiresSettled:boolean;photoMediaId?:string|null};
export type DemoBatch={id:string;name:string;code:string;capacity:number;feeMinor:string;schedule:string;room:string};
export type DemoEnrollment={id:string;studentId:string;batchId:string;status:string};
export type DemoCharge={id:string;studentId:string;batchId:string;amountMinor:string;admissionMinor:string;tuitionMinor:string;paidMinor:string;waivedMinor:string;refundedMinor:string;dueOn:string;period:string};
export type DemoPayment={id:string;chargeId:string;studentId:string;amountMinor:string;method:string;reference:string;recordedAt:string};
export type DemoClaim=Omit<DemoPayment,'recordedAt'>&{status:string;reason:string};
export type DemoAcademic={id:string;batchId:string;subject:string;syllabus:string[];assignment:string;exam:string;totalMarks:number;routine:string;notice:string};
export type DemoWorkspace={id:string;revision:number;archived:boolean;isolated:true;state:{students:DemoStudent[];batches:DemoBatch[];enrollments:DemoEnrollment[];charges:DemoCharge[];payments:DemoPayment[];claims:DemoClaim[];academic:DemoAcademic[];receipts:{snapshot:Record<string,unknown>;adjustments:unknown[]}[]}};
export function validateDemoWorkspace(value:unknown):DemoWorkspace|null;
export function demoTotals(state:DemoWorkspace['state']):{billed:bigint;paid:bigint;waived:bigint;refunded:bigint;outstanding:bigint};

export function demoMessage(code:string):string;
