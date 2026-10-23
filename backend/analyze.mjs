// FORMA 资产分析器：真实解析 GLB / GLTF / OBJ / FBX，输出结构化报告。
// 铁律：所有数字必须来自真实解析，禁止虚构或估算冒充实测。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeResolveExisting } from './paths.mjs';
import { parseGLB } from '../tools/glbkit.mjs';
import {gltfWorldBounds} from './gltfBounds.mjs';
import { sniffImageSize, isPowerOfTwo } from './texture-sniff.mjs';
import { detectFbxTextures } from './fbxTextures.mjs';

const COMPONENT_TYPE_NAMES = {
  5120: 'i8', 5121: 'u8', 5122: 'i16', 5123: 'u16', 5125: 'u32', 5126: 'f32',
};
const PRIMITIVE_MODES = { 0: 'POINTS', 1: 'LINES', 2: 'LINE_LOOP', 3: 'LINE_STRIP', 4: 'TRIANGLES', 5: 'TRIANGLE_STRIP', 6: 'TRIANGLE_FAN' };

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

// ---------- GLB / GLTF ----------

function gltfTextureEntries(gltf, bin, baseDir) {
  const images = gltf.images || [];
  const textures = gltf.textures || [];
  const out = [];
  for (let i = 0; i < textures.length; i++) {
    const tex = textures[i];
    const img = images[tex.source];
    if (!img) continue;
    let bytes = null, mimeType = img.mimeType || null, uri = img.uri || null;
    if (img.bufferView !== undefined && gltf.bufferViews) {
      const bv = gltf.bufferViews[img.bufferView];
      const start = (bv.byteOffset || 0);
      bytes = (gltf.buffers?.[bv.buffer]?.__bytes || bin).subarray(start, start + bv.byteLength);
    } else if (uri && uri.startsWith('data:')) {
      const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(uri);
      if (m) {
        mimeType = mimeType || m[1];
        bytes = Buffer.from(m[3], m[2] ? 'base64' : 'utf8');
      }
    } else if (uri && baseDir) {
      // 外部贴图文件：真实读取
      try {
        const p = safeResolveExisting(baseDir, decodeURIComponent(uri));
        if (fs.existsSync(p) && fs.statSync(p).size < 64 * 1024 * 1024) {
          bytes = fs.readFileSync(p);
          const ext = path.extname(p).toLowerCase();
          if (!mimeType) mimeType = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext] || null;
        }
      } catch { /* 外部贴图不可读时按未知尺寸处理 */ }
    }
    const size = bytes ? sniffImageSize(bytes) : null;
    out.push({
      index: i,
      name: img.name || uri || `texture-${i}`,
      mimeType,
      width: size?.width ?? null,
      height: size?.height ?? null,
      bytes: bytes?.length ?? null,
      source: img.bufferView !== undefined ? 'bufferView' : (uri ? 'uri' : 'unknown'),
      sampler: tex.sampler !== undefined ? {
        magFilter: gltf.samplers?.[tex.sampler]?.magFilter ?? null,
        minFilter: gltf.samplers?.[tex.sampler]?.minFilter ?? null,
        wrapS: gltf.samplers?.[tex.sampler]?.wrapS ?? null,
        wrapT: gltf.samplers?.[tex.sampler]?.wrapT ?? null,
      } : null,
    });
  }
  return out;
}

function gltfMaterialEntries(gltf) {
  const out = [];
  for (let i = 0; i < (gltf.materials || []).length; i++) {
    const m = gltf.materials[i];
    const pbr = m.pbrMetallicRoughness || {};
    out.push({
      index: i,
      name: m.name || `material-${i}`,
      alphaMode: m.alphaMode || 'OPAQUE',
      doubleSided: m.doubleSided === true,
      metallicFactor: pbr.metallicFactor ?? null,
      roughnessFactor: pbr.roughnessFactor ?? null,
      baseColorFactor: pbr.baseColorFactor ?? null,
      emissiveFactor: m.emissiveFactor ?? null,
      textureSlots: {
        baseColor: pbr.baseColorTexture?.index ?? null,
        metallicRoughness: pbr.metallicRoughnessTexture?.index ?? null,
        normal: m.normalTexture?.index ?? null,
        occlusion: m.occlusionTexture?.index ?? null,
        emissive: m.emissiveTexture?.index ?? null,
      },
    });
  }
  return out;
}

function analyzeGltfLike(name, buf, format, baseDir = path.dirname(name)) {
  let gltf, bin;
  if (format === 'glb') {
    ({ json: gltf, bin } = parseGLB(buf));
  } else {
    gltf = JSON.parse(stripBom(buf.toString('utf8')));
    bin = Buffer.alloc(0);
    // 解析外部 buffers（data: 或相对路径 .bin）
    (gltf.buffers || []).forEach((b, i) => {
      if (b.uri && b.uri.startsWith('data:')) {
        const m = /^data:[^;,]+;base64,(.*)$/s.exec(b.uri);
        if (m) gltf.buffers[i] = { ...b, __bytes: Buffer.from(m[1], 'base64') };
      } else if (b.uri) {
        try {
          const p = safeResolveExisting(baseDir, decodeURIComponent(b.uri));
          if (fs.existsSync(p)) gltf.buffers[i] = { ...b, __bytes: fs.readFileSync(p) };
        } catch { /* 忽略不可读外部 buffer */ }
      }
    });
  }

  const issues = [];
  const meshes = [];
  let totalVerts = 0, totalTris = 0, totalPrimitives = 0;
  let bounds = null;

  gltf.__bin=bin;
  try{bounds=gltfWorldBounds(gltf);}
  catch(e){issues.push({severity:'error',code:'position-unreadable',message:'无法计算场景边界：'+e.message,target:'scene'});}

  (gltf.meshes || []).forEach((mesh, mi) => {
    const primitives = [];
    for (const prim of mesh.primitives || []) {
      totalPrimitives++;
      const posAcc = prim.attributes?.POSITION !== undefined ? gltf.accessors[prim.attributes.POSITION] : null;
      let verts = posAcc?.count ?? 0;
      let tris = 0;
      const mode = prim.mode ?? 4;
      if (prim.indices !== undefined) {
        const idxAcc = gltf.accessors[prim.indices];
        if (idxAcc) {
          if (mode === 4) tris = idxAcc.count / 3;
          else if (mode === 5) tris = Math.max(0, idxAcc.count - 2);
          else if (mode === 6) tris = Math.max(0, idxAcc.count - 2);
        }
      } else if (posAcc) {
        if (mode === 4) tris = posAcc.count / 3;
        else if (mode === 5 || mode === 6) tris = Math.max(0, posAcc.count - 2);
      }
      totalVerts += verts; totalTris += tris;

      // 诊断：法线 / UV
      if (prim.attributes?.NORMAL === undefined) {
        issues.push({ severity: 'warn', code: 'missing-normals', message: `网格 ${mesh.name || mi} 缺少法线（NORMAL）——光照与后处理质量受限`, target: `mesh:${mi}` });
      }
      if (prim.attributes?.TEXCOORD_0 === undefined) {
        issues.push({ severity: 'warn', code: 'missing-uv', message: `网格 ${mesh.name || mi} 缺少 UV（TEXCOORD_0）——贴图无法正确展开`, target: `mesh:${mi}` });
      }

      primitives.push({
        material: prim.material ?? null,
        mode: PRIMITIVE_MODES[mode] || mode,
        verts,
        tris,
        attributes: Object.keys(prim.attributes || {}),
        uvSets: Object.keys(prim.attributes || {}).filter((k) => k.startsWith('TEXCOORD_')).length,
      });
    }
    meshes.push({ index: mi, name: mesh.name || `mesh-${mi}`, primitives, verts: primitives.reduce((s, p) => s + p.verts, 0), tris: primitives.reduce((s, p) => s + p.tris, 0) });
  });

  const materials = gltfMaterialEntries(gltf);
  const textures = gltfTextureEntries(gltf, bin, baseDir);

  // 诊断：贴图问题
  for (const t of textures) {
    if (t.width === null) {
      issues.push({ severity: 'info', code: 'texture-size-unknown', message: `贴图 ${t.name} 尺寸无法从二进制头解析`, target: `texture:${t.index}` });
      continue;
    }
    if (t.width > 2048 || t.height > 2048) {
      issues.push({ severity: 'warn', code: 'texture-oversized', message: `贴图 ${t.name} ${t.width}x${t.height} 超过 2048——可考虑压缩（注意：琼剧脸谱/纹样贴图压缩前必须人工确认）`, target: `texture:${t.index}` });
    }
    if (!isPowerOfTwo(t.width) || !isPowerOfTwo(t.height)) {
      issues.push({ severity: 'info', code: 'texture-npot', message: `贴图 ${t.name} ${t.width}x${t.height} 非 2 的幂——WebGL1 下受限（WebGL2 无碍）`, target: `texture:${t.index}` });
    }
  }

  // 诊断：材质问题
  const materialNames = new Set();
  for (const m of materials) {
    if (materialNames.has(m.name)) {
      issues.push({ severity: 'warn', code: 'duplicate-material-name', message: `材质名重复: ${m.name}`, target: `material:${m.index}` });
    }
    materialNames.add(m.name);
    const hasBaseColorTex = m.textureSlots.baseColor !== null;
    if (!hasBaseColorTex && (m.metallicFactor ?? 0) > 0.5) {
      issues.push({ severity: 'info', code: 'metal-without-texture', message: `材质 ${m.name} 金属度 ${m.metallicFactor} 但无基础色贴图`, target: `material:${m.index}` });
    }
  }

  // 诊断：规模
  for (const mesh of meshes) {
    if (mesh.tris > 500000) {
      issues.push({ severity: 'warn', code: 'mesh-oversized', message: `网格 ${mesh.name} 三角形数 ${mesh.tris.toLocaleString()} 超过 50 万——建议 LOD`, target: `mesh:${mesh.index}` });
    }
  }

  const skins = gltf.skins || [];
  const animations = gltf.animations || [];
  if (skins.length > 0) {
    issues.push({ severity: 'info', code: 'has-skinning', message: `资产含 ${skins.length} 个蒙皮——处理时保留骨骼权重`, target: 'skins' });
  }

  return {
    schema: 1,
    file: { name: path.basename(name), bytes: buf.length, sha256: sha256(buf), format },
    asset: { generator: gltf.asset?.generator || null, version: gltf.asset?.version || null, copyright: gltf.asset?.copyright || null },
    stats: {
      meshes: meshes.length,
      primitives: totalPrimitives,
      verts: totalVerts,
      tris: totalTris,
      materials: materials.length,
      textures: textures.length,
      animations: animations.length,
      skins: skins.length,
      cameras: (gltf.cameras || []).length,
      nodes: (gltf.nodes || []).length,
    },
    bounds: bounds ? { min: bounds.min, max: bounds.max, size: bounds.min.map((v, i) => bounds.max[i] - v), source: bounds.source } : null,
    meshes, materials, textures,
    animations: animations.map((a, i) => ({ index: i, name: a.name || `animation-${i}`, channels: (a.channels || []).length, samplers: (a.samplers || []).length })),
    issues,
  };
}

function stripBom(s) { return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s; }

// ---------- OBJ / FBX（three.js loaders，隔离依赖） ----------

async function analyzeObjOrFbx(name, buf, format, baseDir = null) {
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  const THREE = await import('three');

  const issues = [];
  let object;
  let parseNote = '';
  if (format === 'obj') {
    const loader = new OBJLoader();
    object = loader.parse(buf.toString('utf8'));
    parseNote = 'three OBJLoader';
  } else {
    // Geometry analysis has no DOM. Texture bytes are inspected separately below.
    const manager = new THREE.LoadingManager();
    manager.addHandler(/.*/, { path: '', setPath(p) { this.path=p; return this; }, load(url) {
      const texture=new THREE.Texture(); texture.name=String(url);
      if(String(url).startsWith('blob:')) URL.revokeObjectURL(url);
      return texture;
    }});
    const loader = new FBXLoader(manager);
    // FBXLoader 内部用 new Uint8Array(buffer, from, to)，必须传真正的 ArrayBuffer
    // （Node Buffer 是 Uint8Array 子类，偏移参数会被忽略，导致格式判定失败）。
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    object = loader.parse(ab, path.dirname(name) + path.sep);
    parseNote = 'three FBXLoader';
  }

  let meshes = [], totalVerts = 0, totalTris = 0, totalMaterials = 0;
  const materialSet = new Set();
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  object.updateMatrixWorld(true);const worldPoint=new THREE.Vector3();

  object.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh && !child.isPoints && !child.isLine) return;
    const geo = child.geometry;
    if (!geo || !geo.attributes) return;
    const pos = geo.attributes.position;
    if (!pos) return;
    const verts = pos.count;
    const tris = geo.index ? (geo.index.count / 3) : (verts / 3);
    totalVerts += verts;
    totalTris += tris;
    for (let i = 0; i < pos.count; i++) {
      worldPoint.fromBufferAttribute(pos,i).applyMatrix4(child.matrixWorld);
      for (let k = 0; k < 3; k++) {
        const v = worldPoint.getComponent(k);
        if (!Number.isFinite(v)) {
          issues.push({ severity: 'error', code: 'non-finite-position', message: `对象 ${child.name || '(未命名)'} 顶点 ${i} 含非有限坐标`, target: `object:${child.name || child.id}` });
          continue;
        }
        bounds.min[k] = Math.min(bounds.min[k], v);
        bounds.max[k] = Math.max(bounds.max[k], v);
      }
    }
    const matName = child.material?.name || (child.material ? `material-${materialSet.size}` : null);
    if (child.material) materialSet.add(matName);
    meshes.push({
      name: child.name || `mesh-${meshes.length}`,
      verts, tris,
      hasNormals: !!geo.attributes.normal,
      hasUv: !!geo.attributes.uv,
      material: matName,
      skinned: !!child.isSkinnedMesh,
      morphTargets: geo.morphAttributes?.position?.length ?? 0,
    });
    if (!geo.attributes.normal) {
      issues.push({ severity: 'warn', code: 'missing-normals', message: `对象 ${child.name || '(未命名)'} 无法线`, target: `object:${child.name || child.id}` });
    }
    if (!geo.attributes.uv) {
      issues.push({ severity: 'warn', code: 'missing-uv', message: `对象 ${child.name || '(未命名)'} 无 UV`, target: `object:${child.name || child.id}` });
    }
  });
  totalMaterials = materialSet.size;

  // OBJ 未焊接顶点估算：重复 position 行引用（OBJ 每面可重复引用 v）
  if (format === 'obj') {
    const text = buf.toString('utf8');
    const vLines = (text.match(/^v[ \t]/gm) || []).length;
    const fVerts = [...text.matchAll(/^f\s+(.+)$/gm)].reduce((s, m) => s + m[1].trim().split(/\s+/).length, 0);
    if (vLines > 0 && fVerts / vLines > 1.5) {
      issues.push({ severity: 'warn', code: 'obj-unwelded', message: `OBJ 面引用顶点 ${fVerts} 次 vs 唯一定义 ${vLines}——大量重复顶点（未焊接），可 weld 优化`, target: 'geometry' });
    }
  }

  const animClips = object.animations || [];
  const hasBounds = bounds.min.every(Number.isFinite);

  // FBX 纹理三态检测：three 的 FBXLoader 在 Node 下拿不到 blob URL，内嵌贴图会被
  // 静默丢弃（报告恒为 0 张）。这里直接读 FBX 节点树，把「内嵌 / 外部 / 缺失」
  // 逐条判出来——导出方忘打包贴图是 FBX 交付最常见的线上白模原因。
  let texList = [];
  if (format === 'fbx') {
    const dir = baseDir || (path.dirname(name) === '.' ? null : path.dirname(name));
    texList = detectFbxTextures(buf, { baseDir: dir });
    for (const t of texList) {
      if (t.source === 'missing') {
        issues.push({ severity: 'error', code: 'fbx-texture-missing', message: `贴图 ${t.uri || t.name} 未随文件提供（外部引用找不到）——导入/发布后会白模`, target: `texture:${t.index}` });
      } else if (t.source === 'external') {
        issues.push({ severity: 'warn', code: 'fbx-texture-external', message: `贴图 ${t.uri || t.name} 是外部引用（未内嵌）——交付时必须同目录一起打包`, target: `texture:${t.index}` });
      } else {
        issues.push({ severity: 'info', code: 'fbx-texture-embedded', message: `贴图 ${t.uri || t.name} 已内嵌（${t.bytes} B，${t.mime || '未知类型'}${t.width ? `，${t.width}x${t.height}` : ''}）`, target: `texture:${t.index}` });
      }
    }
  }

  return {
    schema: 1,
    file: { name: path.basename(name), bytes: buf.length, sha256: sha256(buf), format },
    asset: { generator: null, version: null, copyright: null, parseNote },
    stats: {
      meshes: meshes.length, primitives: meshes.length,
      verts: totalVerts, tris: totalTris,
      materials: totalMaterials, textures: texList.length,
      animations: animClips.length, skins: meshes.filter((m) => m.skinned).length,
      cameras: 0, nodes: meshes.length,
    },
    bounds: hasBounds ? { min: bounds.min, max: bounds.max, size: bounds.min.map((v, i) => bounds.max[i] - v), source: 'world-static-position' } : null,
    meshes,
    materials: [...materialSet].map((n, i) => ({ index: i, name: n, alphaMode: 'OPAQUE', doubleSided: false, metallicFactor: null, roughnessFactor: null, baseColorFactor: null, emissiveFactor: null, textureSlots: { baseColor: null, metallicRoughness: null, normal: null, occlusion: null, emissive: null } })),
    textures: texList.map((t) => ({
      index: t.index, name: t.name, uri: t.uri, source: t.source,
      mime: t.mime, bytes: t.bytes, sha256: t.sha256, width: t.width, height: t.height,
      external: t.source !== 'embedded' ? { resolved: !!t.resolvedPath } : null,
    })),
    animations: animClips.map((c, i) => ({ index: i, name: c.name || `animation-${i}`, channels: c.tracks?.length ?? 0, samplers: 0 })),
    issues,
  };
}

// ---------- 入口 ----------

// 分析一个 Buffer。kind 来自 validateFile 的 format。
export async function analyzeBuffer(name, buf, kind, opts = {}) {
  const t0 = Date.now();
  let report;
  if (kind === 'glb' || kind === 'gltf') {
    report = analyzeGltfLike(name, buf, kind, opts.baseDir);
  } else if (kind === 'obj' || kind === 'fbx-binary' || kind === 'fbx-ascii') {
    report = await analyzeObjOrFbx(name, buf, kind === 'obj' ? 'obj' : 'fbx', opts.baseDir ?? null);
    if (kind.startsWith('fbx')) report.file.format = kind;
  } else {
    throw new Error(`分析器不支持的类型: ${kind}`);
  }
  report.parseMs = Date.now() - t0;
  return report;
}

// 分析磁盘文件（真实读取）。
export async function analyzeFile(absPath) {
  const buf = fs.readFileSync(absPath);
  const { validateFile } = await import('./validate.mjs');
  const { format } = validateFile(path.basename(absPath), buf);
  // 传完整路径，使 gltf 外部 .bin/贴图能按正确 dirname 解析
  return analyzeBuffer(absPath, buf, format);
}
