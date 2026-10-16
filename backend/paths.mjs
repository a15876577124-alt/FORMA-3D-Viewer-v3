// 路径安全：所有用户输入的文件路径必须解析后限制在 workspace 根内。
// 防目录穿越（..、绝对路径、符号链接逃逸——符号链接在写入侧额外校验 realpath）。
import path from 'node:path';
import fs from 'node:fs';

export class PathError extends Error {
  constructor(message) { super(message); this.name = 'PathError'; this.status = 403; }
}

// 将用户提供的相对路径解析到 root 内；越界即抛错。
export function safeJoin(root, userPath) {
  if (typeof userPath !== 'string' || userPath.length === 0) {
    throw new PathError('路径不能为空');
  }
  if (path.isAbsolute(userPath)) {
    throw new PathError('不允许绝对路径');
  }
  const resolved = path.resolve(root, userPath);
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PathError(`路径越出 workspace: ${userPath}`);
  }
  return resolved;
}

// 校验已存在路径的真实位置（防符号链接逃逸）。不存在时返回原路径。
export function safeResolveExisting(root, userPath) {
  const joined = safeJoin(root, userPath);
  if (fs.existsSync(joined)) {
    const real = fs.realpathSync(joined);
    const realRoot = fs.realpathSync(root);
    const rel = path.relative(realRoot, real);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new PathError(`路径越出 workspace（符号链接）: ${userPath}`);
    }
    return real;
  }
  return joined;
}

// 资产 ID 只允许安全字符，防止注入路径分隔符。
export function assertSafeId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(id)) {
    throw new PathError(`非法资产 ID: ${String(id).slice(0, 40)}`);
  }
  if (id.startsWith('.')) throw new PathError('资产 ID 不能以点开头');
  return id;
}
