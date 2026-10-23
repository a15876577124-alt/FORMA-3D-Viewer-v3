// Historical command retained. The launch deck was replaced by the exhibition
// catalogue; exercise its equivalent real routes in an isolated project snapshot.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=spawnSync(process.execPath,['tests/run.mjs','--only=exhibition'],{cwd:root,stdio:'inherit',windowsHide:true});
if(run.error)throw run.error;
process.exitCode=run.status??1;
