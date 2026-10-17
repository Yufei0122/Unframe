// Only lock an explicitly preserved selection. Mixed retain/add/remove requests
// still need the model to apply the visitor's edits.
export function preservedMustSeeIds(message, preferences) {
  const retain = /(?:保留|保持)[^，。！？；\n]{0,24}必看(?:作品|艺术品|清单)?|\b(?:keep|retain|preserve)\s+(?:(?:my|the|all|our|existing|current|already|selected|chosen|same)\s+)*must[- ]see(?:\s+(?:artworks?|works?|selection|list))?/giu;
  const matches = [...message.matchAll(retain)];
  if (!matches.length) return undefined;
  // Do not interpret a negated request or a combined edit as a pure keep command.
  if (matches.some(match => /(?:不要|不必|不用|别|不再|not|never|don't|do not|no need to)\s*$/iu.test(message.slice(0, match.index)))) return undefined;
  const remainder = message.replace(retain, '');
  if (/(?:添加|增加|加入|加上|包括|包含|删除|移除|去掉|清空|取消|换成|替换|改成|除了|但|除外)|\b(?:add|include|remove|drop|clear|replace|except|but|instead|also)\b/iu.test(remainder)) return undefined;
  return [...preferences.mustSeeArtworkIds];
}
