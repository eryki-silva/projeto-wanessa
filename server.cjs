const {spawn}=require('node:child_process');
const path=require('node:path');
const child=spawn(process.execPath,[path.join(__dirname,'node_modules/tsx/dist/cli.mjs'),path.join(__dirname,'scripts/serve.ts')],{stdio:'inherit',windowsHide:true});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??0));