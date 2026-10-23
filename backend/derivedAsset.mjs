import fs from 'node:fs';import path from 'node:path';
import {resolveAssetSource,describeAssetSource} from './assetSource.mjs';
import {nextVersionDir,PipelineError} from './runPipeline.mjs';
import {generateConfirmToken,verifyConfirmToken} from './gate.mjs';
import {validateFile} from './validate.mjs';
import {validateGltf} from './validateGltf.mjs';
import {parseGLB} from '../tools/glbkit.mjs';
import {detectFbxTextures} from './fbxTextures.mjs';
import {analyzeFile} from './analyze.mjs';
import {PROJECT_ROOT} from './paths.mjs';
export async function saveDerivedAsset({assetId,baseVersion=0,dataBase64,confirmToken,dryRun=false}){
 const source=resolveAssetSource(assetId,baseVersion);
 if(!['fbx','obj'].includes(source.format))throw new PipelineError('仅 OBJ/FBX 需要生成可处理 GLB 版本');
 const ops=[{op:'prepareGLB',params:{baseVersion}}];
 if(dryRun)return {dryRun:true,assetId,wouldApply:ops};
 const bytes=Buffer.from(dataBase64||'','base64');validateFile('model.glb',bytes);
 const warnings=['FBX/OBJ 专有材质与约束未保证保留；请检查转换结果'];
 const inputImages=source.format==='fbx'?detectFbxTextures(fs.readFileSync(source.file),{baseDir:path.dirname(source.file)}).length:null;
 const outputImages=parseGLB(bytes).json.images?.length||0;
 if(inputImages!==null && outputImages<inputImages)warnings.push('原始 FBX 含 '+inputImages+' 张图像，GLB 含 '+outputImages+' 张；部分通道可能合并或不被支持。此转换不是完整材质无损转换，请检查粗糙度、金属度与权重贴图。');
 if(!verifyConfirmToken(confirmToken,assetId,ops))throw new PipelineError('格式转换可能改变 FBX/OBJ 材质表现，请确认生成 GLB 工作版本',409,{needConfirm:true,token:generateConfirmToken(assetId,ops),reasons:warnings});

 const {version,dir}=nextVersionDir(assetId),file=path.join(dir,'model.glb');
 const meta={assetId,version,baseVersion,kind:'Converted',warnings,textureInventory:{inputImages,outputImages},sourcePath:source.path,createdAt:new Date().toISOString(),status:'running',converter:'Three.js 0.186.1 FBX/OBJLoader + GLTFExporter'};
 const write=(name,obj)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(obj,null,2));write('version.json',meta);
 try{
  fs.writeFileSync(file,bytes,{flag:'wx'});const validation=await validateGltf(file),after=await analyzeFile(file),before=(await describeAssetSource(assetId,baseVersion)).report;
  const checks=[{name:'gltf.validator',ok:validation.issues.numErrors===0,detail:validation.issues},{name:'geometry.triangles',ok:after.stats.tris>0&&before.stats.tris===after.stats.tris,detail:{before:before.stats.tris,after:after.stats.tris}}];
  const verify={pass:checks.every(c=>c.ok),checks:[{op:'prepareGLB',pass:checks.every(c=>c.ok),checks}]};
  write('report.before.json',before);write('report.after.json',after);write('verify.json',verify);write('ops.json',{...meta,ops});write('version.json',{...meta,modelFile:'model.glb',status:verify.pass?'complete':'failed',verifyPass:verify.pass});
  const stat=r=>({...r.stats,bytes:r.file.bytes,sha256:r.file.sha256});
  return {assetId,version,baseVersion,beforePath:source.path,afterPath:path.relative(PROJECT_ROOT,file).split(path.sep).join('/'),before:stat(before),after:stat(after),verify,results:[{op:'prepareGLB',changes:['新建 GLB 工作版本；原始模型保持只读'],warnings} ]};
 }catch(e){write('version.json',{...meta,status:'failed',error:e.message});throw e;}
}
