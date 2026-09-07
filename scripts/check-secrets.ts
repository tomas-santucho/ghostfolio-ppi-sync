const decoder=new TextDecoder();
const listed=Bun.spawnSync({cmd:['git','ls-files'],stdout:'pipe',stderr:'pipe'});
if(listed.exitCode!==0)throw new Error(`Unable to list tracked files: ${decoder.decode(listed.stderr)}`);

const paths=decoder.decode(listed.stdout).split(/\r?\n/).filter(Boolean);
const patterns=[
  {name:'environment secret',expression:/(?:^|\n)\s*(PPI_PRIVATE_KEY|PPI_CLIENT_KEY|PPI_PUBLIC_KEY|PPI_AUTHORIZED_CLIENT|GHOSTFOLIO_ACCESS_TOKEN|GHOSTFOLIO_SECURITY_TOKEN)\s*=\s*([^\r\n#]+)/g},
  {name:'quoted secret',expression:/\b(PPI_PRIVATE_KEY|PPI_CLIENT_KEY|PPI_PUBLIC_KEY|PPI_AUTHORIZED_CLIENT|GHOSTFOLIO_ACCESS_TOKEN|GHOSTFOLIO_SECURITY_TOKEN)\s*:\s*['"]([^'"]+)['"]/g},
  {name:'authorization token',expression:/\bauthorization\s*:\s*['"](?:Bearer\s+)?([^'"]+)['"]/gi}
];
const isSafeFixture=(value:string):boolean=>{
  const normalized=value.trim().replace(/^Bearer\s+/i,'');
  return !normalized||normalized==='...'||normalized.startsWith('your-')||normalized.startsWith('test-')||normalized.startsWith('synthetic-')||['private','token','secret','client','public','authorized'].includes(normalized);
};
const findings:string[]=[];
for(const path of paths){
  if(/^(?:node_modules|dist)\//.test(path)||/\.(?:png|jpg|jpeg|gif|ico|lock)$/i.test(path))continue;
  const content=await Bun.file(path).text();
  for(const {name,expression} of patterns){
    expression.lastIndex=0;
    for(const match of content.matchAll(expression)){
      const value=match[2]??match[1]??'';
      if(!isSafeFixture(value))findings.push(`${path}: possible ${name}`);
    }
  }
}
if(findings.length>0)throw new Error(`Secret-check failed:\n${findings.join('\n')}`);
console.log(`Secret-check passed for ${paths.length} tracked files.`);
