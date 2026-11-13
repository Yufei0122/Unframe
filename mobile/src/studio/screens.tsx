import React, { useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { images, museumImages } from '../assets';
import { Icon, T, serif } from '../ui';
import type { StudioArtwork, StudioCase, StudioField, StudioRole, StudioStage, StudioUser } from '../../../shared/studio-types';
import { caseTitle, fieldLabel, museumName, stageLabel, useStudio } from './context';
import { useLocale } from './locale';
import { Action, Copy, Heading, Input, palette, Pill, st, TextLink } from './theme';

function Filters({ items, selected, onChange }: { items: { id: string; label: string }[]; selected: string; onChange: (id: string) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: selected === item.id }} aria-pressed={selected === item.id} onPress={() => onChange(item.id)} style={[st.chip, selected === item.id && { backgroundColor: palette.green, borderColor: palette.green }]}><T style={{ fontSize: 12, color: selected === item.id ? 'white' : palette.muted }}>{item.label}</T></Pressable>)}</ScrollView>;
}
function Status({ item }: { item: StudioCase }) { const { language } = useLocale(); return <Pill tone={item.status === 'published' || item.status === 'ready' ? 'green' : 'amber'}>{stageLabel(item.status, language === 'zh')}</Pill>; }
function Empty({ title, body }: { title: string; body: string }) { return <View style={[st.card, { alignItems: 'center', paddingVertical: 30 }]}><Icon name="checkmark-done-outline" size={30} color={palette.green}/><Heading small>{title}</Heading><Copy muted style={{ textAlign: 'center' }}>{body}</Copy></View>; }
function CaseRow({ item }: { item: StudioCase }) {
  const { data, navigate } = useStudio(), { language } = useLocale();
  const art = data.artworks.find(art => art.id === item.artworkId);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.id} ${caseTitle(item, language === 'zh')}`} onPress={() => navigate({ type: 'case', id: item.id }, 'review')} style={[st.card, st.row]}>
    {images[item.artworkId] && <Image source={images[item.artworkId]} style={{ width: 46, height: 55, borderRadius: 7 }}/>}
    <View style={{ flex: 1, gap: 4 }}><Copy style={{ fontWeight: '600' }}>{caseTitle(item, language === 'zh')}</Copy><Copy muted style={{ fontSize: 11 }}>{item.id} · {art?.title}</Copy><Status item={item}/></View><Icon name="chevron-forward" size={17}/>
  </Pressable>;
}
function Stats({ compact = false }: { compact?: boolean }) {
  const { cases, data } = useStudio(), { t } = useLocale();
  const pending = cases.filter(item => item.status === 'review' || item.status === 'verify');
  const today = new Date().toDateString();
  const caseIds = new Set(cases.map(item => item.id));
  const values = compact ? [
    { label: t('Pending', '待审核'), count: pending.length, target: 'pending' as const, icon: 'clipboard-outline' as const },
    { label: t('Sources', '待补来源'), count: pending.filter(item => !item.evidence.verified).length, target: 'sources' as const, icon: 'link-outline' as const },
  ] : [
    { label: t('Pending', '待审核'), count: pending.length, target: 'pending' as const, icon: 'clipboard-outline' as const },
    { label: t('Priority', '优先处理'), count: pending.filter(item => item.priority === 'high').length, target: 'priority' as const, icon: 'alert-circle-outline' as const },
    { label: t('Reviewed today', '今日已审'), count: data.audit.filter(item => item.caseId && caseIds.has(item.caseId) && ['review_passed', 'verification_passed', 'returned'].includes(item.action) && new Date(item.date).toDateString() === today).length, target: 'today' as const, icon: 'checkmark-circle-outline' as const },
    { label: t('Ready', '待发布'), count: cases.filter(item => item.status === 'ready').length, target: 'ready' as const, icon: 'layers-outline' as const },
  ];
  const { navigate } = useStudio();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{values.map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={`${item.label}: ${item.count}`} onPress={() => navigate(item.target === 'ready' ? { type: 'releases' } : { type: 'queue', filter: item.target }, item.target === 'ready' ? 'workflow' : 'review')} style={[st.card, { width: '48%', flexGrow: 1, gap: compact ? 3 : 6, padding: compact ? 13 : 17 }]}><View style={st.row}><Icon name={item.icon} size={18}/><Copy style={{ fontSize: 12 }}>{item.label}</Copy></View><T style={{ fontFamily: serif, fontSize: 31, lineHeight: 38, color: palette.green }}>{item.count}</T></Pressable>)}</View>;
}

export function ContentScreen() {
  const { artworks, cases, navigate, data } = useStudio(), { t } = useLocale();
  const [filter, setFilter] = useState('all');
  const available = filter === 'all' ? artworks : artworks.filter(art => cases.some(item => item.artworkId === art.id && item.kind === filter && !['returned', 'published'].includes(item.status)));
  return <>
    <View style={{ minHeight: 105, justifyContent: 'center', overflow: 'hidden', borderRadius: 8 }}><Image source={museumImages.met} style={{ position: 'absolute', right: -75, top: -40, width: 240, height: 200, opacity: .15 }}/><Heading>{t('Review\nwith care.', '让每条信息\n值得信任。')}</Heading></View>
    <Stats compact/>
    <Filters selected={filter} onChange={setFilter} items={[{ id: 'all', label: t('All', '全部') }, { id: 'artwork', label: t('Artworks', '作品') }, { id: 'ai', label: t('AI text', 'AI解说') }]}/>
    {!available.length && <Empty title={t('Nothing here yet', '暂无此类修改')} body={t('Propose a content update to begin.', '选择作品并提交修改，即可开始审核。')}/>}
    {available.map((art, index) => {
      const review = cases.find(item => item.artworkId === art.id && !['published', 'returned'].includes(item.status));
      return <View key={art.id} style={[st.card, { padding: 10, gap: 11 }]}>
        {images[art.id] && <Image source={images[art.id]} style={{ width: '100%', height: index === 0 ? 160 : 105, borderRadius: 9 }} accessibilityLabel={art.title}/>}
        <View style={{ paddingHorizontal: 5, gap: 8 }}><View style={st.between}><View style={{ flex: 1 }}><Heading small>{art.title}</Heading><Copy muted style={{ fontSize: 11 }}>{art.artist} · {art.year}</Copy></View>{review && <Status item={review}/>}</View>
          {review ? <Action label={t('Review', '查看审核')} onPress={() => navigate({ type: 'case', id: review.id }, 'review')}/> : ['admin', 'reviewer'].includes(data.user.role) && <Action label={t('Propose update', '提交修改')} icon="create-outline" onPress={() => navigate({ type: 'edit', artworkId: art.id })}/>}
        </View>
      </View>;
    })}
  </>;
}

export function OverviewScreen() {
  const { cases, data, navigate } = useStudio(), { language, t } = useLocale();
  const ids = new Set(cases.map(item => item.id));
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(); day.setDate(day.getDate() - 6 + index); return { day, count: data.audit.filter(item => item.caseId && ids.has(item.caseId) && ['review_passed', 'verification_passed'].includes(item.action) && new Date(item.date).toDateString() === day.toDateString()).length }; });
  const max = Math.max(1, ...days.map(item => item.count));
  const priority = cases.filter(item => ['review', 'verify'].includes(item.status)).sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high')).slice(0, 3);
  return <><Heading>{t('Overview', '监管总览')}</Heading><Stats/>
    <View style={st.card}><Heading small>{t('This week', '本周审核')}</Heading><View accessibilityLabel={t('Daily completed review steps', '每日完成的审核步骤')} style={{ height: 112, flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>{days.map(({ day, count }, index) => <View key={index} style={{ flex: 1, alignItems: 'center', gap: 5 }}><Copy muted style={{ fontSize: 10 }}>{count}</Copy><View style={{ width: '100%', height: Math.max(3, count / max * 64), backgroundColor: index === 6 ? palette.green : '#A8B5A0', borderRadius: 2 }}/><Copy muted style={{ fontSize: 10 }}>{day.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en', { weekday: 'narrow' })}</Copy></View>)}</View></View>
    <View style={st.between}><Heading small>{t('Needs attention', '优先处理')}</Heading><TextLink onPress={() => navigate(null, 'review')}>{t('View all', '查看全部')}</TextLink></View>
    {priority.length ? priority.map(item => <CaseRow key={item.id} item={item}/>) : <Empty title={t('All caught up', '当前没有待审事项')} body={t('New submissions will appear here.', '新的修改提交后会在这里显示。')}/>}
  </>;
}

export function QueueScreen({ initialFilter = 'open' }: { initialFilter?: string }) {
  const { cases, data } = useStudio(), { language, t } = useLocale();
  const [filter, setFilter] = useState(initialFilter === 'pending' ? 'open' : initialFilter);
  const reviewedToday = new Set(data.audit.filter(entry => ['review_passed', 'verification_passed', 'returned'].includes(entry.action) && new Date(entry.date).toDateString() === new Date().toDateString()).map(entry => entry.caseId));
  const shown = cases.filter(item => filter === 'today' ? reviewedToday.has(item.id) : filter === 'priority' ? ['review', 'verify'].includes(item.status) && item.priority === 'high' : filter === 'sources' ? ['review', 'verify'].includes(item.status) && !item.evidence.verified : filter === 'open' ? ['review', 'verify'].includes(item.status) : item.status === filter);
  return <><Heading>{t('Review queue', '审核队列')}</Heading><Filters selected={filter} onChange={setFilter} items={['open', 'priority', 'sources', 'today', 'ready', 'returned', 'published'].map(id => ({ id, label: id === 'open' ? t('Pending', '待审核') : id === 'priority' ? t('Priority', '优先处理') : id === 'sources' ? t('Sources', '待补来源') : id === 'today' ? t('Today', '今日已审') : stageLabel(id, language === 'zh') }))}/>{shown.length ? shown.map(item => <CaseRow key={item.id} item={item}/>) : <Empty title={t('No matching cases', '暂无审核单')} body={t('Submit an update from Content to get started.', '可以在内容策展台选择作品并提交修改。')}/>}</>;
}

export function CaseScreen({ item }: { item: StudioCase }) {
  const { data, navigate, mutate, busy } = useStudio(), { language, t } = useLocale();
  const [note, setNote] = useState(''), [history, setHistory] = useState(false), [assigning, setAssigning] = useState(false);
  const art = data.artworks.find(art => art.id === item.artworkId)!;
  const canReview = ['admin', 'reviewer'].includes(data.user.role);
  const active = item.status === 'review' || item.status === 'verify';
  const selfVerify = item.status === 'verify' && item.firstReviewer === data.user.id;
  const act = async (action: string) => { await mutate(`/studio/cases/${item.id}/action`, { action, version: item.version, note }); };
  return <>
    <View style={st.between}><Heading>{t('Review case', '审核详情')}</Heading><Status item={item}/></View>
    <View style={{ gap: 5 }}><Heading small>{caseTitle(item, language === 'zh')}</Heading><Copy muted>{item.id} · {art.title}</Copy></View>
    <Filters items={[{ id: 'details', label: t('Details', '审核内容') }, { id: 'history', label: t('History', '修改记录') }]} selected={history ? 'history' : 'details'} onChange={id => setHistory(id === 'history')}/>
    {history ? <History item={item}/> : <>
      <View style={[st.card, { backgroundColor: '#F1EFE9' }]}><Icon name="chatbox-ellipses-outline" size={18} color={palette.muted}/><Copy>{item.reason}</Copy></View>
      <Copy muted>{fieldLabel(item.field, language === 'zh')}</Copy>
      <View style={{ gap: 10 }}><View style={[st.card, { backgroundColor: '#F0EEE9' }]}><Copy muted>{t('Current', '当前内容')}</Copy><Copy>{item.current || t('Not provided', '暂无内容')}</Copy></View><View style={[st.card, { backgroundColor: palette.softAmber }]}><Copy muted>{t('Proposed', '建议修改')}</Copy><Copy>{item.proposed}</Copy></View></View>
      <Heading small>{t('Evidence', '相关证据')}</Heading>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Open evidence', '打开证据核验')} onPress={() => navigate({ type: 'evidence', id: item.id }, 'review')} style={[st.card, st.between]}><View style={st.row}><Icon name="document-text-outline" size={19}/><Copy>{t('Source record', '来源资料')}</Copy></View><Pill tone={item.evidence.verified ? 'green' : 'amber'}>{item.evidence.verified ? t('Verified', '已核验') : t('Needs check', '待核验')}</Pill><Icon name="chevron-forward" size={16}/></Pressable>
      <Copy muted>{t('Assigned to', '负责人')}: {data.members.find(member => member.id === item.assignedTo)?.name || t('Unassigned', '未分配')}</Copy>
      {data.user.role === 'admin' && !['published', 'returned'].includes(item.status) && <><TextLink onPress={() => setAssigning(!assigning)}>{t('Assign reviewer', '分配审核员')}</TextLink>{assigning && data.members.filter(member => ['admin', 'reviewer'].includes(member.role)).map(member => <Action key={member.id} secondary disabled={busy} label={member.name} onPress={() => { void mutate(`/studio/cases/${item.id}/action`, { action: 'assign', version: item.version, assignedTo: member.id }).then(result => { if (result) setAssigning(false); }); }}/>)}</>}
      {canReview && ['review', 'verify', 'ready'].includes(item.status) && <>
        <Input label={t('Review note', '审核说明')} value={note} onChangeText={setNote} multiline maxLength={2000} placeholder={t('Add a reason…', '填写审核或退回理由…')}/>
        {!item.evidence.verified && <Copy muted>{t('Verify the source before approving.', '核验来源后可通过审核。')}</Copy>}
        {selfVerify && <View style={st.notice}><Copy>{t('A different reviewer must complete verification. Switch accounts from your profile.', '复核须由另一位审核员完成。可从头像切换账号。')}</Copy></View>}
        <View style={st.row}><Action style={{ flex: 1 }} secondary label={t('Return', '退回补充')} disabled={busy} onPress={() => { void act('return'); }}/>{active && <Action style={{ flex: 1 }} label={item.status === 'review' ? t('Pass review', '通过初审') : t('Approve', '通过复核')} disabled={busy || !item.evidence.verified || selfVerify} onPress={() => { void act('approve'); }}/>}</View>
      </>}
      {item.status === 'returned' && canReview && <Action label={t('Revise and resubmit', '修改并重新提交')} onPress={() => navigate({ type: 'edit', artworkId: art.id, caseId: item.id }, 'content')}/>}
      {item.status === 'ready' && <Action label={t('View ready content', '查看待发布内容')} onPress={() => navigate({ type: 'releases' }, 'workflow')}/>}
      {item.status === 'published' && <View style={st.notice}><Copy>{t('This revision is published in the visitor app.', '此修改已发布到访客端。')}</Copy></View>}
    </>}
  </>;
}

const actions: Record<string, [string, string]> = { submitted: ['Submitted', '已提交'], resubmitted: ['Resubmitted', '重新提交'], evidence_verified: ['Source verified', '来源已核验'], evidence_pending: ['Source needs check', '来源待核验'], review_passed: ['Initial review passed', '通过初审'], verification_passed: ['Verification passed', '通过复核'], returned: ['Returned', '已退回'], published: ['Published', '已发布'], assigned: ['Assigned reviewer', '已分配审核员'] };
function History({ item }: { item: StudioCase }) {
  const { language } = useLocale(), { data } = useStudio();
  return <>{[...item.history].reverse().map(entry => <View key={entry.id} style={st.card}><Copy style={{ fontWeight: '600' }}>{actions[entry.action]?.[language === 'zh' ? 1 : 0] || entry.action}</Copy><Copy muted>{entry.actor} · {new Date(entry.date).toLocaleString(language === 'zh' ? 'zh-CN' : 'en')}</Copy>{!!entry.note && <Copy>{entry.action === 'assigned' ? data.members.find(member => member.id === entry.note)?.name || entry.note : entry.note}</Copy>}</View>)}</>;
}

export function EvidenceScreen({ item }: { item: StudioCase }) {
  const { language, t } = useLocale(), { data, navigate, mutate, busy } = useStudio();
  const [verified, setVerified] = useState(item.evidence.verified), [note, setNote] = useState(item.evidence.note), [tab, setTab] = useState('text'), [linkError, setLinkError] = useState(false);
  const art = data.artworks.find(art => art.id === item.artworkId)!;
  const editable = ['review', 'verify'].includes(item.status) && ['admin', 'reviewer'].includes(data.user.role);
  return <><Heading>{t('Evidence', '证据核验')}</Heading><View style={st.row}><Image source={images[art.id]} style={{ width: 57, height: 62, borderRadius: 8 }}/><View style={{ flex: 1 }}><Copy style={{ fontWeight: '600' }}>{art.title}</Copy><Copy muted>{item.id} · {fieldLabel(item.field, language === 'zh')}</Copy></View></View>
    <Filters items={[{ id: 'text', label: t('Text', '内容') }, { id: 'sources', label: t('Sources', '来源') }, { id: 'history', label: t('History', '记录') }]} selected={tab} onChange={setTab}/>
    {tab === 'history' ? <History item={item}/> : <>
      {tab === 'text' && <View style={st.card}><Heading small>{t('Claim to verify', '待核验陈述')}</Heading><View style={{ backgroundColor: palette.softAmber, padding: 11, borderRadius: 7 }}><Copy>{item.proposed}</Copy></View></View>}
      <View style={st.card}><Heading small>{t('Source record', '来源资料')}</Heading><Copy muted>{museumName(art.museumId, language === 'zh')}</Copy><Copy style={{ fontSize: 12 }}>{item.sourceUrl}</Copy><TextLink icon="open-outline" onPress={() => { setLinkError(false); void Linking.openURL(item.sourceUrl).catch(() => setLinkError(true)); }}>{t('Open record', '查看来源')}</TextLink>{linkError && <Copy>{t('This source could not be opened.', '无法打开此来源。')}</Copy>}</View>
      <View style={st.card}><View style={st.between}><Copy>{fieldLabel(item.field, language === 'zh')}</Copy><Pill tone={verified ? 'green' : 'amber'}>{verified ? t('Verified', '已核验') : t('Needs check', '待核验')}</Pill></View><View style={st.between}><Copy>{t('Source supports the change', '来源支持此次修改')}</Copy><Switch accessibilityLabel={t('Mark source verified', '确认来源已核验')} disabled={!editable} value={verified} onValueChange={setVerified} trackColor={{ true: palette.green, false: '#D4D3CB' }}/></View></View>
      <Input label={t('Source finding', '核验结论')} value={note} onChangeText={setNote} multiline editable={editable} maxLength={2000} placeholder={t('Quote the supporting record or explain what is missing.', '摘录来源依据，或说明仍缺少什么。')}/>
      {editable && <Action label={t('Save findings', '保存核验结果')} disabled={busy || verified && note.trim().length < 5} onPress={() => { void mutate(`/studio/cases/${item.id}/evidence`, { version: item.version, verified, note }, 'PATCH').then(result => { if (result) navigate({ type: 'case', id: item.id }, 'review'); }); }}/>}
      <TextLink icon="arrow-back" onPress={() => navigate({ type: 'case', id: item.id }, 'review')}>{t('Back to review', '返回审核详情')}</TextLink>
    </>}
  </>;
}

export function EditScreen({ art, previous }: { art: StudioArtwork; previous?: StudioCase }) {
  const { language, t } = useLocale(), { mutate, busy, navigate } = useStudio();
  const [field, setField] = useState<StudioField>(previous?.field || 'description'), [value, setValue] = useState(previous?.proposed || '');
  const [source, setSource] = useState(previous?.sourceUrl || art.sourceUrl || ''), [reason, setReason] = useState(previous?.reason || ''), [high, setHigh] = useState(previous?.priority === 'high'), [kind, setKind] = useState(previous?.kind || 'artwork');
  const fields: StudioField[] = ['description', 'detail', 'year', 'chineseIntroduction', 'sourceUrl', 'imageCredit'];
  const submit = async () => {
    const item = await mutate<StudioCase>(previous ? `/studio/cases/${previous.id}/action` : '/studio/cases', { action: 'resubmit', version: previous?.version, artworkId: art.id, field, proposed: value, sourceUrl: source, reason, priority: high ? 'high' : 'normal', kind });
    if (item) navigate({ type: 'case', id: item.id }, 'review');
  };
  return <><Heading>{previous ? t('Revise submission', '修改审核单') : t('Propose an update', '提交内容修改')}</Heading><Copy muted>{art.title} · {art.artist} · {art.year}</Copy>
    {!previous && <Filters selected={kind} onChange={id => setKind(id as 'ai' | 'artwork')} items={[{ id: 'artwork', label: t('Artwork content', '作品内容') }, { id: 'ai', label: t('AI text', 'AI解说') }]}/>}
    <Copy>{t('Field to update', '修改字段')}</Copy><Filters items={fields.map(id => ({ id, label: fieldLabel(id, language === 'zh') }))} selected={field} onChange={id => { if (!previous) { setField(id as StudioField); setValue(''); } }}/>
    <View style={st.card}><Copy muted>{t('Current published content', '当前已发布内容')}</Copy><Copy>{String(art[field] || t('Not provided', '暂无内容'))}</Copy></View>
    <Input label={t('Proposed content', '建议修改内容')} value={value} onChangeText={setValue} multiline maxLength={5000}/>
    <Input label={t('Reason for change', '修改原因')} value={reason} onChangeText={setReason} multiline maxLength={2000}/>
    <Input label={t('Source URL (HTTPS)', '来源链接（HTTPS）')} value={source} onChangeText={setSource} autoCapitalize="none" keyboardType="url" maxLength={2048}/>
    {!previous && <View style={st.between}><Copy>{t('High priority', '高优先级')}</Copy><Switch accessibilityLabel={t('High priority', '高优先级')} value={high} onValueChange={setHigh} trackColor={{ true: palette.green, false: '#D4D3CB' }}/></View>}
    <View style={st.notice}><Copy>{t('Your change goes through two reviewers before publication. The live version stays available.', '修改通过初审、复核后才可发布，现有版本继续展示。')}</Copy></View>
    <Action label={t('Submit for review', '提交审核')} disabled={busy || !value.trim() || reason.trim().length < 5 || !source.trim()} onPress={() => { void submit(); }}/>
  </>;
}

export function WorkflowScreen() {
  const { data, cases, navigate } = useStudio(), { language, t } = useLocale();
  const stages: StudioStage[] = ['review', 'verify', 'ready'];
  const ready = cases.filter(item => item.status === 'ready');
  return <><View style={st.between}><Heading>{t('Team review', '审核协作')}</Heading><Pressable accessibilityRole="button" accessibilityLabel={t('Manage members', '管理成员')} onPress={() => navigate({ type: 'account' })} style={{ minHeight: 44, justifyContent: 'center' }}><Copy muted>{data.members.filter(member => member.canAccessStudio).length} {t('members', '位成员')}</Copy></Pressable></View>
    <View style={st.between}>{stages.map((stage, index) => <React.Fragment key={stage}>{index > 0 && <Icon name="arrow-forward" size={15} color={palette.muted}/>}<View style={{ alignItems: 'center', gap: 7 }}><View style={{ width: 25, height: 25, borderRadius: 15, borderWidth: 1, borderColor: stage === 'review' ? palette.accent : palette.border, alignItems: 'center', justifyContent: 'center' }}><Copy>{cases.filter(item => item.status === stage).length}</Copy></View><Copy muted style={{ fontSize: 11 }}>{stageLabel(stage, language === 'zh')}</Copy></View></React.Fragment>)}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{stages.map(stage => <View key={stage} style={{ width: 190, minHeight: 280, borderRadius: 13, padding: 10, gap: 10, backgroundColor: stage === 'review' ? '#F4E9D9' : '#E8EBE2' }}><View style={st.between}><Copy style={{ fontWeight: '600' }}>{stageLabel(stage, language === 'zh')}</Copy><Pill>{cases.filter(item => item.status === stage).length}</Pill></View>{cases.filter(item => item.status === stage).map(item => <Pressable accessibilityRole="button" accessibilityLabel={`${item.id} ${caseTitle(item, language === 'zh')}`} key={item.id} style={[st.card, { padding: 12 }]} onPress={() => navigate({ type: 'case', id: item.id }, 'review')}><Copy style={{ fontWeight: '600' }}>{caseTitle(item, language === 'zh')}</Copy><Copy muted style={{ fontSize: 11 }}>{item.id}</Copy><Copy muted style={{ fontSize: 11 }}>{data.members.find(member => member.id === item.assignedTo)?.name || t('Unassigned', '未分配')}</Copy></Pressable>)}</View>)}</ScrollView>
    <View style={st.card}><View style={st.row}><Icon name="layers-outline" size={25} color={palette.accent}/><View style={{ flex: 1 }}><Heading small>{t('Ready for release', '待发布内容')}</Heading><Copy muted>{ready.length} {t('verified changes', '项已通过复核')}</Copy></View></View><TextLink onPress={() => navigate({ type: 'releases' })}>{t('View changes', '查看变更摘要')}</TextLink></View>
    <Action label={t('Review release', '查看待发布内容')} onPress={() => navigate({ type: 'releases' })}/>
    <TextLink onPress={() => navigate({ type: 'account' })}>{t('Manage members', '管理成员')}</TextLink>
  </>;
}

export function ReleasesScreen() {
  const { cases, data, mutate, busy } = useStudio(), { t } = useLocale();
  const [selected, setSelected] = useState<string[]>([]), [confirm, setConfirm] = useState(false);
  const ready = cases.filter(item => item.status === 'ready'), chosen = ready.filter(item => selected.includes(item.id));
  const canPublish = data.user.role === 'admin' || data.user.role === 'publisher';
  const publish = async () => { const result = await mutate('/studio/releases', { cases: chosen.map(item => ({ id: item.id, version: item.version })) }); if (result) { setSelected([]); setConfirm(false); } };
  return <><Heading>{t('Release review', '发布审核')}</Heading><Copy muted>{t('Only verified changes appear here. Select the changes to publish.', '仅展示已通过复核的修改，选择本次要发布的内容。')}</Copy>
    {!canPublish && <View style={st.notice}><Copy>{t('An administrator or publisher must confirm publication.', '发布须由管理员或发布员确认。')}</Copy></View>}
    {!ready.length && <Empty title={t('No changes ready', '暂无待发布内容')} body={t('Complete initial review and verification first.', '完成初审和复核后，修改会在此显示。')}/>}
    {ready.map(item => <View key={item.id} style={{ gap: 8 }}><CaseRow item={item}/>{canPublish && <Pressable accessibilityRole="checkbox" accessibilityLabel={`${t('Select', '选择')} ${item.id}`} accessibilityState={{ checked: selected.includes(item.id) }} aria-checked={selected.includes(item.id)} onPress={() => setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} style={[st.row, { minHeight: 44, paddingLeft: 10 }]}><Icon name={selected.includes(item.id) ? 'checkbox' : 'square-outline'} size={23} color={palette.green}/><Copy>{t('Include in release', '加入此次发布')}</Copy></Pressable>}</View>)}
    {canPublish && ready.length > 0 && <Action label={t(`Publish selected (${chosen.length})`, `发布所选内容（${chosen.length}）`)} disabled={busy || !chosen.length} onPress={() => setConfirm(true)}/>}
    <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}><View style={{ flex: 1, justifyContent: 'center', padding: 25, backgroundColor: '#19272270' }}><View style={st.card}><Heading small>{t('Publish to Unframe?', '发布至 Unframe？')}</Heading><Copy>{t(`${chosen.length} verified changes will become visible to visitors.`, `${chosen.length}项已复核修改将展示给访客。`)}</Copy><Action label={t('Confirm publication', '确认发布')} busy={busy} onPress={() => { void publish(); }}/><Action secondary label={t('Cancel', '取消')} disabled={busy} onPress={() => setConfirm(false)}/></View></View></Modal>
  </>;
}

export function AccountScreen() {
  const { data, logout, exit, mutate, busy } = useStudio(), { t } = useLocale();
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [role, setRole] = useState('visitor'), [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ member: StudioUser; role: StudioRole } | null>(null);
  const roleName = (value: string) => value === 'visitor' ? t('Visitor', '访客账号') : value === 'admin' ? t('Administrator', '管理员') : value === 'publisher' ? t('Publisher', '发布员') : t('Reviewer', '审核员');
  return <><Heading>{t('Your workspace', '工作区设置')}</Heading><View style={st.card}><Heading small>{data.user.name}</Heading><Copy muted>{data.user.email}</Copy><Pill tone="green">{roleName(data.user.role)}</Pill></View>
    <Heading small>{data.user.role === 'admin' ? t('Account access', '账号权限') : t('Members', '团队成员')}</Heading>{data.members.map(member => <View key={member.id} style={{ gap: 8 }}><View style={[st.between, { paddingVertical: 8 }]}><View style={{ flex: 1 }}><Copy>{member.name}</Copy><Copy muted style={{ fontSize: 11 }}>{member.email}</Copy></View><Pill>{roleName(member.role)}</Pill></View>{data.user.role === 'admin' && <TextLink onPress={() => setEditing(editing?.member.id === member.id ? null : { member, role: member.role })}>{`${t('Edit access', '修改权限')} · ${member.email}`}</TextLink>}{editing?.member.id === member.id && <View style={st.card}><Filters selected={editing.role} onChange={id => setEditing({ member, role: id as StudioRole })} items={['visitor', 'reviewer', 'publisher', 'admin'].map(id => ({ id, label: roleName(id) }))}/><Copy muted>{editing.role === 'visitor' ? t('Visitor access only. The Studio option is hidden.', '仅使用访客界面，不显示审核后台选项。') : t('This account can switch between Visitor and Studio.', '此账号可在访客界面与审核后台之间切换。')}</Copy><Action label={t('Save access', '保存权限')} disabled={busy || editing.role === member.role} onPress={() => { void mutate(`/studio/members/${member.id}`, { role: editing.role }, 'PATCH').then(result => { if (result) setEditing(null); }); }}/></View>}</View>)}
    {data.user.role === 'admin' && <><Action label={t('Add account', '新增账号')} secondary onPress={() => setAdding(!adding)}/>{adding && <View style={st.card}><Input label={t('Account name', '账号姓名')} value={name} onChangeText={setName} maxLength={60}/><Input label={t('Account email', '账号邮箱')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" maxLength={254}/><Input label={t('Initial password', '初始密码')} value={password} onChangeText={setPassword} secureTextEntry maxLength={128}/><Copy muted>{t('At least 10 characters. Share it with the member privately.', '至少10个字符，请私下交给成员。')}</Copy><Filters selected={role} onChange={setRole} items={['visitor', 'reviewer', 'publisher', 'admin'].map(id => ({ id, label: roleName(id) }))}/><Action label={t('Create account', '创建账号')} disabled={busy || !name.trim() || !email.trim() || password.length < 10} onPress={() => { void mutate<StudioUser>('/studio/members', { name, email, password, role }).then(result => { if (result) { setPassword(''); setName(''); setEmail(''); setAdding(false); setRole('visitor'); } }); }}/></View>}</>}
    <Action secondary label={t('Switch to visitor', '切换到访客端')} disabled={busy} onPress={exit} icon="swap-horizontal-outline"/>
    <Action label={t('Sign out', '退出登录')} disabled={busy} onPress={() => { void logout(); }} icon="log-out-outline"/>
  </>;
}
