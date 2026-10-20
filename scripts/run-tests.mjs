import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
// Run application tests only. Unpacked installer payloads are not a test workspace.
function collect(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?collect(join(directory,entry.name)):/\.test\.(?:mjs|cjs|js)$/.test(entry.name)?[join(directory,entry.name)]:[]);}
const result=spawnSync(process.execPath,['--test',...process.argv.slice(2),...collect('tests').sort()],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
