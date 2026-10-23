import fs from 'node:fs';
import path from 'node:path';
import validator from 'gltf-validator';
import {resourcePath} from './gltfIO.mjs';
export async function validateGltf(file){
  return validator.validateBytes(new Uint8Array(fs.readFileSync(file)),{uri:path.basename(file),maxIssues:100,externalResourceFunction:async uri=>new Uint8Array(fs.readFileSync(resourcePath(path.dirname(file),uri)))});
}
