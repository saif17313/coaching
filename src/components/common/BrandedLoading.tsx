import {BrandSymbol} from './BrandSymbol';
import './brand.css';
export function BrandedLoading({label='Preparing your learning space'}:{label?:string}){return <div className="brand-loading" role="status" aria-live="polite"><div className="brand-loading-symbol"><BrandSymbol size={76}/></div><strong>EduCentre</strong><p>{label}</p><div className="brand-loading-lines" aria-hidden="true"><i/><i/><i/></div></div>;}
