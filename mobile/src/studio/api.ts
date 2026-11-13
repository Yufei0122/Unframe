import { resolveAPIBase } from '../apiConfig';
import type { Language } from './locale';

export class StudioError extends Error { constructor(public code: string, message: string) { super(message); } }
export async function studioRequest<T>(path: string, token?: string, data?: object, method = data === undefined ? 'GET' : 'POST'): Promise<T> {
  const base = resolveAPIBase(process.env.EXPO_PUBLIC_API_URL, typeof window !== 'undefined' ? window.location : undefined);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base}/api${path}`, { method, signal: controller.signal, headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new StudioError(result.code || 'REQUEST_FAILED', result.error || 'The request could not be completed.');
    return result;
  } catch (error) {
    if (error instanceof StudioError) throw error;
    throw new StudioError('OFFLINE', 'Cannot reach the Unframe server. Start the backend and check the API address.');
  } finally { clearTimeout(timeout); }
}
const errors: Record<string, string> = {
  PASSWORD_MISMATCH: '两次输入的密码不一致。', EMAIL_EXISTS: '此邮箱已注册，请直接登录。', REGISTER_LIMIT: '注册尝试次数过多，请在15分钟后重试。',
  STUDIO_FORBIDDEN: '此账号没有审核后台权限，可继续使用访客界面。', PERMISSION_CHANGED: '此账号的权限已更新，请刷新后继续。', LAST_ADMIN_REQUIRED: '工作区至少需要保留一位管理员。', MEMBER_NOT_FOUND: '此账号不存在。', ROLE_INVALID: '请选择有效的账号权限。',
  OFFLINE: '无法连接 Unframe 服务，请启动后端并检查 API 地址。', AUTH_REQUIRED: '登录已过期，请重新登录。', LOGIN_INVALID: '邮箱或密码不正确。', LOGIN_LIMIT: '尝试次数过多，请在15分钟后重试。', EMAIL_INVALID: '请输入有效的邮箱地址。', PASSWORD_INVALID: '密码长度须为10至128个字符。', NAME_REQUIRED: '请填写姓名。', SETUP_COMPLETE: '管理员已创建，请直接登录。', LOCAL_SETUP_ONLY: '请在运行后端的电脑上创建首位管理员。', SOURCE_INVALID: '请填写不含账号信息的 HTTPS 来源链接。', REASON_REQUIRED: '请填写至少5个字符的修改原因。', VALUE_INVALID: '请填写有效的修改内容，最多5000个字符。', VALUE_UNCHANGED: '建议内容与当前内容相同。', EVIDENCE_NOTE_REQUIRED: '请填写至少5个字符的来源核验结论。', EVIDENCE_REQUIRED: '请先完成来源核验。', SECOND_REVIEWER_REQUIRED: '复核须由另一位审核员完成。', RETURN_NOTE_REQUIRED: '请填写至少5个字符的退回原因。', VERSION_CONFLICT: '此审核单已发生变化，请刷新后重试。', PUBLICATION_CONFLICT: '已发布内容已更新，请退回此修改并基于最新版本重新提交。', RELEASE_CONFLICT: '同一作品的修改须分批发布，后续修改需基于最新版本重新审核。', STAGE_INVALID: '当前阶段不允许此操作，请刷新查看最新状态。', ADMIN_REQUIRED: '此操作需要管理员权限。', REVIEW_FORBIDDEN: '当前账号没有审核权限。', PUBLISH_FORBIDDEN: '当前账号没有发布权限。', MEMBER_EXISTS: '此邮箱已存在，或成员数量已达上限。', ORIGIN_FORBIDDEN: '此访问地址未获允许，请检查后端的来源配置。', NOTE_INVALID: '审核说明最多2000个字符。', DUPLICATE_CASE: '相同修改已有审核单，请从审核队列中查看。',
};
export function studioError(error: unknown, language: Language) {
  if (language === 'zh') return error instanceof StudioError ? errors[error.code] || '操作未完成，请检查输入并重试。' : '操作未完成，请重试。';
  return error instanceof Error ? error.message : 'Please try again.';
}
