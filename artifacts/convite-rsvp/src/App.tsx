import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { ClerkProvider, SignIn, SignUp, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Archive, ArrowRight, BarChart3, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Copy, ExternalLink,
  Heart, Image as ImageIcon, LayoutDashboard, Loader2, Mail, MapPinned, Menu, MessageCircle, Pencil, Plus, Quote, Search, Send,
  Settings, ShieldCheck, Sparkles, Trash2, UserCheck, Users, X, XCircle
} from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey, getGetEventQueryKey, getGetInviteQueryKey, getHealthCheckQueryKey, getListCheckinsQueryKey,
  getListInvitesQueryKey, getListMessagesQueryKey, useCreateCheckin, useCreateInvite, useCreateMessage,
  useDeleteInvite, useGetDashboardSummary, useGetEvent, useGetInvite, useListCheckins, useListInvites,
  useListMessages, useRespondToInvite, useUpdateEvent, useUpdateInvite, useUpdateMessage, useHealthCheck
} from '@workspace/api-client-react';
import type { GuestMessage, Invite, InviteInputType, Participant } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const demoToken = 'x8k29guest01';
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

function initials(name = '') { return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'C'; }
function dateLabel(value?: string) { if (!value) return '—'; return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)); }
function shortDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
}
function timeLabel(value?: string) { if (!value) return 'agora'; return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
type CompanionDraft = { name: string; relation: string };
type InviteFormData = {
  name: string;
  type: InviteInputType;
  maxPeople: number;
  allowCompanions: boolean;
  companions: CompanionDraft[];
  phone: string;
  internalNotes: string;
};
function inviteCompanionLabel(companion: CompanionDraft) {
  return companion.name.trim() ? `${companion.name} · ${companion.relation || 'Acompanhante'}` : 'Acompanhante ainda não definido';
}
function initialInviteCompanions(invite?: Invite): CompanionDraft[] {
  return (invite?.companions || []).map((companion) => ({
    name: companion.name || '',
    relation: companion.relation || 'Acompanhante',
  }));
}

function LoadingState({ label = 'Carregando detalhes' }: { label?: string }) {
  return <div className="panel p-6 space-y-4" data-testid="state-loading"><div className="skeleton h-5 w-1/3" /><div className="skeleton h-10 w-2/3" /><div className="skeleton h-24 w-full" /><p className="muted text-xs">{label}</p></div>;
}
function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return <div className="panel p-8 text-center" data-testid="state-error"><XCircle className="mx-auto mb-3 text-[hsl(var(--destructive))]" size={28} /><h3 className="serif text-xl">Não conseguimos carregar agora</h3><p className="muted text-sm mt-2">A conexão parece ter oscilado. Tente novamente em alguns instantes.</p>{onRetry && <button className="btn btn-outline mt-5" onClick={onRetry} data-testid="button-retry"><ArrowRight size={14} /> Tentar de novo</button>}</div>;
}
function EmptyState({ icon: Icon = Users, title, detail, action }: { icon?: typeof Users; title: string; detail: string; action?: ReactNode }) {
  return <div className="panel p-12 text-center" data-testid="state-empty"><Icon className="mx-auto mb-4 text-[hsl(var(--accent))]" size={30} /><h3 className="serif text-2xl">{title}</h3><p className="muted text-sm mt-2 max-w-sm mx-auto">{detail}</p>{action}</div>;
}
function useFlash() {
  const [flash, setFlash] = useState('');
  const notify = (message: string) => { setFlash(message); window.setTimeout(() => setFlash(''), 3200); };
  return { flash, notify };
}
function Flash({ message }: { message: string }) { return message ? <div className="toast" role="status" data-testid="status-feedback"><Check size={15} className="inline mr-2 text-[hsl(var(--accent))]" />{message}</div> : null; }

const nav = [
  { href: '/admin', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/admin/convidados', label: 'Convidados', icon: Users },
  { href: '/admin/checkin', label: 'Check-in', icon: UserCheck },
  { href: '/admin/mensagens', label: 'Mensagens', icon: MessageCircle },
  { href: '/admin/configuracoes', label: 'Configurações', icon: Settings },
];
function AdminShell({ children, title, eyebrow }: { children: ReactNode; title: string; eyebrow?: string }) {
  const [location] = useLocation();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 60000 } });
  const eventQuery = useGetEvent({ query: { queryKey: getGetEventQueryKey(), staleTime: 60000 } });
  const coupleName = eventQuery.data ? `${eventQuery.data.couple.name1} & ${eventQuery.data.couple.name2}` : 'Meu evento';
  return <div className="app-shell noise">
    <aside className="sidebar">
      <div className="flex items-center gap-3 px-2 mb-12"><div className="brand-mark">C</div><div className="brand-copy"><div className="serif text-lg leading-none">Convite</div><div className="mono text-[9px] tracking-[.16em] text-[hsl(var(--accent))] mt-1">RSVP PREMIUM</div></div></div>
      <div className="px-2 mb-4 eyebrow" style={{ color: 'hsl(var(--accent))' }}>Organização</div>
      <nav>{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase().replace(' ', '-')}`}><Icon size={17} strokeWidth={1.7} /><span className="nav-copy">{label}</span></Link>)}</nav>
      <div className="side-foot mt-auto px-2 pt-8 border-t border-[hsl(var(--sidebar-border))]"><div className="text-[11px] text-[hsl(var(--sidebar-foreground)/.5)]">Celebrando juntos</div><div className="serif text-sm mt-1">{coupleName}</div><div className="mono text-[9px] mt-4 text-[hsl(var(--accent))]">{health.isError ? 'CONEXÃO INSTÁVEL' : 'SISTEMA OPERACIONAL'}</div><Link href="/" className="text-[11px] text-[hsl(var(--accent))] mt-3 inline-flex items-center gap-1" data-testid="link-view-invite">Ver convite <ExternalLink size={11} /></Link></div>
    </aside>
    <div className="main-area">
      <header className="topbar"><div className="flex items-center gap-3"><div className="md:hidden"><Menu size={18} /></div><div><div className="eyebrow hidden sm:block">{eyebrow || 'Meu evento'}</div><div className="font-semibold text-sm">{title}</div></div></div><div className="flex items-center gap-3"><div className="avatar">{eventQuery.data?.couple.name1.slice(0, 1) || 'C'}{eventQuery.data?.couple.name2.slice(0, 1) || 'E'}</div><div className="hidden sm:block text-right"><div className="text-xs font-semibold">{coupleName}</div><div className="text-[10px] muted">Organizadores</div></div></div></header>
      <main className="page-content">{children}</main>
    </div>
    <nav className="mobile-nav">{nav.slice(0, 4).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={location === href ? 'active' : ''} data-testid={`mobile-link-${label}`}><Icon size={18} /><span>{label}</span></Link>)}</nav>
  </div>;
}

function PublicReveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setVisible(true); return undefined; }
    const element = ref.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.12 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`public-reveal ${visible ? 'is-visible' : ''} ${className}`}>{children}</div>;
}

function AnniversaryCountdown({ target }: { target: string }) {
  const calculate = () => {
    const difference = Math.max(0, new Date(target).getTime() - Date.now());
    const totalSeconds = Math.floor(difference / 1000);
    return {
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
    };
  };
  const [remaining, setRemaining] = useState(calculate);
  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(calculate()), 1000);
    return () => window.clearInterval(timer);
  }, [target]);
  return <div className="public-countdown" data-testid="countdown-event">
    {([{ key: 'days', label: 'Dias' }, { key: 'hours', label: 'Horas' }, { key: 'minutes', label: 'Minutos' }, { key: 'seconds', label: 'Segundos' }] as const).map(({ key, label }) => <div className="public-countdown-item" key={key} data-testid={`countdown-${key}`}><span className="public-countdown-number">{String(remaining[key]).padStart(2, '0')}</span><span className="public-countdown-label">{label}</span></div>)}
  </div>;
}

function Invitation({ token }: { token: string }) {
  const eventQuery = useGetEvent({ query: { queryKey: getGetEventQueryKey() } });
  const inviteQuery = useGetInvite(token, { query: { queryKey: getGetInviteQueryKey(token) } });
  const respond = useRespondToInvite();
  const createMessage = useCreateMessage();
  const client = useQueryClient();
  const { flash, notify } = useFlash();
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [rsvpOpen, setRsvpOpen] = useState(false);
  const [choice, setChoice] = useState<'confirmed' | 'declined'>('confirmed');
  const [names, setNames] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [messageAuthor, setMessageAuthor] = useState('');
  const event = eventQuery.data;
  const invite = inviteQuery.data;
  const hasCompanionFields = Boolean(invite && invite.type !== 'individual' && invite.allowCompanions && invite.maxPeople > 1);
  const companionSlots: CompanionDraft[] = invite && hasCompanionFields
    ? (() => {
      const defined = initialInviteCompanions(invite).slice(0, Math.max(0, invite.maxPeople - 1));
      const available = Math.max(0, invite.maxPeople - 1 - defined.length);
      return [...defined, ...Array.from({ length: available }, () => ({ name: '', relation: 'Acompanhante' }))];
    })()
    : [];
  const confirmedCompanionNames = invite?.participants?.filter((participant) => participant.kind !== 'titular').map((participant) => participant.name) || [];
  const openRsvp = () => {
    if (!invite) return;
    setChoice(invite.status === 'declined' ? 'declined' : 'confirmed');
    setNames(companionSlots.map((companion, index) => confirmedCompanionNames[index] || companion.name));
    setNote(invite.message || '');
    setRsvpOpen(true);
  };

  useEffect(() => {
    if (!rsvpOpen && !welcomeOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setRsvpOpen(false); setWelcomeOpen(false); } };
    document.addEventListener('keydown', closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', closeOnEscape); document.body.style.overflow = previousOverflow; };
  }, [rsvpOpen, welcomeOpen]);

  if (eventQuery.isLoading || inviteQuery.isLoading) return <main className="public-invite min-h-dvh p-5 md:p-12" aria-busy="true"><div className="skeleton h-[82vh] w-full opacity-20" /><p className="sr-only">Carregando seu convite</p></main>;
  if (eventQuery.isError || inviteQuery.isError || !event || !invite) return <main className="public-invite grid min-h-dvh place-items-center p-6"><div className="public-rsvp-shell public-reveal is-visible"><Heart className="mx-auto text-[#e2be74]" size={29} /><h1 className="public-section-heading mx-auto mt-5 text-center">Este convite está em pausa</h1><p className="public-hero-subtitle mx-auto mt-4 text-center">Confira o link recebido ou fale com os anfitriões para receber ajuda.</p><button className="public-rsvp-button" onClick={() => { eventQuery.refetch(); inviteQuery.refetch(); }} data-testid="button-retry-invite">Tentar novamente</button></div></main>;

  const date = new Date(event.eventDate);
  const formattedDate = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  const guestMessage = invite.message || event.message || 'Depois de 50 anos juntos, queremos celebrar esta história ao lado de quem torna a nossa vida mais bonita.';
  const coupleLabel = `${event.couple.name1} & ${event.couple.name2}`;
  const submitResponse = () => {
    const trimmedNames = names.map((name) => name.trim()).filter(Boolean);
    const participantNames = choice === 'declined' ? [] : [invite.name.trim(), ...trimmedNames].filter(Boolean).slice(0, invite.maxPeople);
    const finalParticipants: Participant[] = choice === 'declined'
      ? []
      : participantNames.map((name, index) => ({
        name,
        kind: index === 0 ? 'titular' : (companionSlots[index - 1]?.relation || 'Acompanhante'),
      }));
    if (choice === 'confirmed' && (!finalParticipants.length || finalParticipants.length > invite.maxPeople)) {
      notify('Informe ao menos o nome do convidado principal.');
      return;
    }
    respond.mutate({ token, data: { status: choice, participants: finalParticipants, message: note } }, {
      onSuccess: () => { client.invalidateQueries({ queryKey: getGetInviteQueryKey(token) }); setRsvpOpen(false); notify(choice === 'confirmed' ? 'Presença confirmada. Será uma alegria ter você conosco.' : 'Resposta registrada com carinho.'); },
      onError: () => notify('Não conseguimos salvar agora. Tente novamente em instantes.'),
    });
  };

  return <main className="public-invite noise" data-testid="public-invitation">
    <a className="public-skip" href="#public-rsvp">Ir para confirmação de presença</a>
    <nav className="public-nav" aria-label="Navegação do convite">
      <a className="public-brand" href="#inicio" data-testid="link-invite-home"><span className="public-brand-mark">C</span><span className="public-brand-copy">Arquivo de família · {event.couple.yearsTogether} anos</span></a>
      <div className="public-nav-links"><a href="#historia" data-testid="link-invite-story">A história</a><a href="#celebracao" data-testid="link-invite-celebration">O encontro</a><a className="public-nav-rsvp" href="#public-rsvp" data-testid="link-invite-rsvp">RSVP <ArrowRight size={13} /></a></div>
    </nav>

    <section className="public-hero" id="inicio" data-testid="section-invite-hero">
      <img className="public-hero-image" src={event.heroImage} alt={`${coupleLabel}, retrato do casal`} data-testid="img-invite-hero" />
      <div className="public-hero-grid">
        <div className="public-hero-copy fade-up">
          <div className="public-kicker">Carta privada · uma celebração de {event.couple.yearsTogether} anos</div>
          <h1 className="public-hero-title">{event.couple.name1}<br /><em>&</em> {event.couple.name2}</h1>
          <p className="public-hero-subtitle">Uma vida inteira escolhendo um ao outro, agora aberta como uma carta para quem também faz parte desta história.</p>
          <div className="public-hero-meta">{formattedDate} · {event.eventTime}</div>
        </div>
        <aside className="public-hero-card fade-up d2" aria-label="Mensagem personalizada">
          <div className="public-hero-card-label">Esta carta foi guardada para</div>
          <strong>{invite.name}</strong>
          <p>{guestMessage}</p>
          {invite.type !== 'individual' && invite.allowCompanions && invite.maxPeople > 1 && <div className="mt-4 border-t border-[#d7ab67]/30 pt-4" data-testid="text-invite-composition"><div className="public-hero-card-label">Com você</div>{invite.companions?.length ? <div className="mt-2 space-y-1">{invite.companions.map((companion, index) => <div key={`hero-companion-${index}`} className="text-xs text-[#ead09d]" data-testid={`text-hero-companion-${index}`}>{companion.name || 'Acompanhante ainda não definido'} <span className="text-[10px] text-white/55">· {companion.relation || 'Acompanhante'}</span></div>)}</div> : <div className="mt-2 text-xs text-[#ead09d]">{invite.maxPeople - 1} vagas de acompanhante disponíveis</div>}</div>}
          <button type="button" className="public-hero-card-cta" onClick={openRsvp} data-testid="button-hero-rsvp">Responder à carta <ArrowRight size={13} /></button>
        </aside>
      </div>
      <a className="public-scroll-cue" href="#abertura" aria-label="Descer para a celebração"><ChevronDown size={14} /> Abrir</a>
    </section>

    <section className="public-section public-section--paper" id="abertura" data-testid="section-anniversary-intro">
      <PublicReveal className="public-section-inner">
        <div className="public-intro-grid">
          <div><div className="public-section-kicker">Folha de abertura</div><h2 className="public-section-heading">{event.couple.yearsTogether} anos de uma <em>vida compartilhada.</em></h2><div className="public-rule" /><p className="text-sm leading-relaxed text-[#536056] max-w-xs">Algumas histórias ficam mais bonitas quando são lidas em voz alta, à mesa, entre pessoas queridas.</p></div>
          <div className="public-letter" data-testid="text-personal-message"><Quote size={27} className="mb-5 text-[#78342f]" strokeWidth={1.2} /><p>{guestMessage}</p><div className="public-signature"><span className="public-signature-mark">{initials(coupleLabel)}</span><span className="serif italic text-lg">{coupleLabel}</span></div></div>
        </div>
      </PublicReveal>
    </section>

    <section className="public-section public-section--wine" data-testid="section-countdown">
      <PublicReveal className="public-section-inner">
        <div className="public-countdown-wrap"><div><div className="public-section-kicker">A próxima página</div><h2 className="public-section-heading">O encontro está se aproximando.</h2></div><AnniversaryCountdown target={event.eventDate} /></div>
      </PublicReveal>
    </section>

    <section className="public-section public-section--paper" id="historia" data-testid="section-our-story">
      <PublicReveal className="public-section-inner">
        <div className="public-intro-grid"><figure className="public-portrait"><img src={event.couple.photoUrl || event.heroImage} alt={`Retrato de ${coupleLabel}`} data-testid="img-couple-portrait" /><figcaption>Uma vida · muitos capítulos</figcaption></figure><div><div className="public-section-kicker">A história, sem resumo</div><h2 className="public-section-heading">O amor mora nos <em>detalhes.</em></h2><div className="public-rule" /><p className="max-w-md text-sm leading-[1.9] text-[#536056]">{event.message || guestMessage}</p><p className="mt-5 max-w-md text-sm leading-[1.9] text-[#536056]">É essa memória viva que queremos dividir com você, em uma noite feita de afeto, conversa e reencontros.</p></div></div>
      </PublicReveal>
    </section>

    {event.timeline?.length > 0 && <section className="public-section public-section--paper pt-0" data-testid="section-timeline"><PublicReveal className="public-section-inner"><div className="public-section-kicker">Notas do arquivo</div><h2 className="public-section-heading">Capítulos que nos trouxeram até aqui.</h2><div className="public-timeline">{event.timeline.map((item) => <article className="public-timeline-item" key={item.id} data-testid={`timeline-item-${item.id}`}><div className="public-timeline-year">{item.year}</div><div className="public-timeline-content"><h3 className="public-timeline-title">{item.title}</h3><p className="public-timeline-copy">{item.description}</p>{item.photoUrl && <img className="mt-4 h-28 w-44 object-cover" src={item.photoUrl} alt="" />}</div></article>)}</div></PublicReveal></section>}

    {event.gallery?.length > 0 && <section className="public-section public-section--plum" data-testid="section-gallery"><PublicReveal className="public-section-inner"><div className="public-gallery-intro"><div><div className="public-section-kicker">Fotografias encontradas</div><h2 className="public-section-heading">Memórias para <em>guardar.</em></h2></div><p className="public-gallery-note">Um pequeno álbum de instantes que continuam presentes na forma como eles olham um para o outro.</p></div><div className="public-gallery">{event.gallery.map((image) => <figure key={image.id} data-testid={`gallery-item-${image.id}`}><img src={image.imageUrl} alt={image.alt} data-testid={`img-gallery-${image.id}`} /><figcaption>{image.alt}</figcaption></figure>)}</div></PublicReveal></section>}

    <section className="public-section public-section--plum" id="celebracao" data-testid="section-celebration-details">
      <PublicReveal className="public-section-inner"><div className="public-section-kicker">A página do encontro</div><h2 className="public-section-heading">{event.venue}</h2><p className="public-hero-subtitle mt-5 max-w-md">Uma noite para brindar ao tempo, às escolhas e a todos os encontros que fizeram parte do caminho.</p><div className="public-location-grid"><div className="public-detail"><CalendarDays size={18} className="mb-4 text-[#d7ab67]" /><div className="public-detail-label">Quando</div><div className="public-detail-value">{formattedDate}</div><div className="public-detail-copy">{event.eventTime}</div></div><div className="public-detail"><MapPinned size={18} className="mb-4 text-[#d7ab67]" /><div className="public-detail-label">Onde</div><div className="public-detail-value">{event.address}</div>{event.mapUrl && <a href={event.mapUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs text-[#e9c37f]" data-testid="link-map">Abrir mapa <ArrowRight size={12} /></a>}</div></div>{event.dressCode && <div className="mt-9 flex items-center gap-3 text-xs text-white/65"><Sparkles size={16} className="text-[#d7ab67]" /><span>Traje sugerido: <strong className="font-medium text-[#e9c37f]">{event.dressCode}</strong></span></div>}</PublicReveal>
    </section>

    <section className="public-section public-section--paper" id="public-rsvp" data-testid="section-rsvp"><PublicReveal className="public-rsvp-shell"><div className="public-section-kicker">A folha de resposta</div><h2 className="public-section-heading mx-auto mt-4">{hasCompanionFields ? 'Vocês poderão estar conosco?' : 'Você poderá estar conosco?'}</h2><div className="public-rule" /><p className="public-rsvp-copy">{hasCompanionFields ? 'Sua presença é o presente que mais desejamos. Confirme com calma — e conte quem estará com você.' : 'Sua presença é o presente que mais desejamos. Confirme com calma.'}</p><button className="public-rsvp-button" onClick={openRsvp} data-testid="button-open-rsvp"><Heart size={14} /> Responder convite</button>{invite.status !== 'pending' && <div className="public-rsvp-status" data-testid="status-rsvp"><CheckCircle2 size={14} className="text-[#4a8a69]" /> Sua resposta já foi registrada como <strong>{invite.status === 'confirmed' ? 'confirmada' : 'declinada'}</strong>.</div>}</PublicReveal></section>

    <section className="public-section public-section--wine" data-testid="section-guest-message"><PublicReveal className="public-section-inner public-message-shell"><div><div className="public-section-kicker">Uma última folha</div><h2 className="public-section-heading mt-4">Deixe uma mensagem para os anfitriões.</h2><p className="mt-5 max-w-xs text-sm leading-relaxed text-white/60">Palavras simples também viram lembrança. Escreva algo que eles possam guardar.</p></div><form className="public-message-form" onSubmit={(eventForm) => { eventForm.preventDefault(); if (!messageAuthor || !message) return; createMessage.mutate({ data: { author: messageAuthor, message, token } }, { onSuccess: () => { setMessage(''); setMessageAuthor(''); notify('Mensagem enviada para os anfitriões.'); }, onError: () => notify('Não conseguimos enviar sua mensagem agora.') }); }}><input value={messageAuthor} onChange={(eventInput) => setMessageAuthor(eventInput.target.value)} className="field" placeholder="Seu nome" aria-label="Seu nome" data-testid="input-message-author" /><textarea value={message} onChange={(eventInput) => setMessage(eventInput.target.value)} className="field" placeholder="Escreva com carinho..." aria-label="Sua mensagem" data-testid="input-guest-message" /><button type="submit" disabled={createMessage.isPending || !messageAuthor.trim() || !message.trim()} data-testid="button-send-message">{createMessage.isPending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} Enviar mensagem</button></form></PublicReveal></section>

    <footer className="public-footer"><div className="public-footer-names">{coupleLabel}</div><div className="public-footer-note">Com amor, sempre · {event.couple.yearsTogether} anos</div></footer>

    {welcomeOpen && <div className="public-modal-backdrop public-welcome-backdrop" role="presentation" onMouseDown={(eventModal) => { if (eventModal.target === eventModal.currentTarget) setWelcomeOpen(false); }}><div className="public-welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><div className="public-section-kicker">Uma carta para</div><h2 id="welcome-title">{invite.name}</h2><div className="public-welcome-rule" /><p>Será uma alegria celebrar 50 anos dessa história com vocês.</p><div className="public-welcome-actions"><button className="public-rsvp-button" onClick={() => { setWelcomeOpen(false); openRsvp(); }} data-testid="button-welcome-rsvp"><Heart size={14} /> Confirmar presença</button><button className="public-welcome-link" onClick={() => setWelcomeOpen(false)} data-testid="button-welcome-continue">Ver convite</button></div></div></div>}
    {rsvpOpen && <div className="public-modal-backdrop" role="presentation" onMouseDown={(eventModal) => { if (eventModal.target === eventModal.currentTarget) setRsvpOpen(false); }}><div className="public-modal" role="dialog" aria-modal="true" aria-labelledby="rsvp-title"><div className="public-modal-head"><div><div className="public-section-kicker">Sua resposta</div><h2 id="rsvp-title">Que bom ter você aqui.</h2></div><button className="public-modal-close" onClick={() => setRsvpOpen(false)} aria-label="Fechar confirmação" data-testid="button-close-rsvp"><X size={16} /></button></div><div className="public-modal-body"><div className="mb-5 rounded border border-[#cbbda9] bg-[#f7f0e5] p-4"><div className="label mb-2">Convite para</div><div className="font-semibold">{invite.name}</div>{hasCompanionFields && companionSlots.length > 0 && <div className="mt-3 space-y-2"><div className="label mb-1">Acompanhantes</div>{companionSlots.map((companion, index) => <div key={`summary-${index}`} className="flex items-center gap-2 text-sm text-[#536056]" data-testid={`text-companion-summary-${index}`}><span className="h-1.5 w-1.5 rounded-full bg-[#78342f]" />{companion.name ? <span>{companion.name} <span className="text-xs">({companion.relation || 'Acompanhante'})</span></span> : <span>Vaga de acompanhante</span>}</div>)}</div>}</div><div><label className={`public-choice ${choice === 'confirmed' ? 'selected' : ''}`}><input type="radio" name="rsvp-choice" checked={choice === 'confirmed'} onChange={() => setChoice('confirmed')} /><span><strong>{hasCompanionFields ? 'Sim, estaremos presentes' : 'Sim, estarei presente'}</strong><small className="block mt-1 text-[#536056]">Mal podemos esperar para celebrar juntos.</small></span></label><label className={`public-choice ${choice === 'declined' ? 'selected' : ''}`}><input type="radio" name="rsvp-choice" checked={choice === 'declined'} onChange={() => setChoice('declined')} /><span><strong>Não poderei comparecer</strong><small className="block mt-1 text-[#536056]">Agradeço muito o convite e desejo uma noite linda.</small></span></label></div>{choice === 'confirmed' && hasCompanionFields && <div className="mt-6"><label className="label">Quem estará com você?</label><p className="mb-3 text-xs text-[#536056]">Os nomes já definidos aparecem aqui. Preencha apenas as vagas ainda em aberto.</p>{companionSlots.map((companion, index) => <div key={`companion-field-${index}`} className="mb-3"><div className="mb-1 flex items-center justify-between gap-3 text-xs text-[#536056]"><span>{companion.name ? `${companion.name} · ${companion.relation || 'Acompanhante'}` : 'Acompanhante ainda não definido'}</span>{!companion.name && <span className="rounded-full bg-[#e3d6c4] px-2 py-1 text-[10px]">Vaga disponível</span>}</div>{companion.name ? <div className="rounded border border-[#cbbda9] bg-[#f7f0e5] px-3 py-2 text-sm text-[#536056]" data-testid={`text-defined-companion-${index}`}>{companion.name} <span className="text-xs">({companion.relation || 'Acompanhante'})</span></div> : <input id={`input-companion-name-${index}`} value={names[index] || ''} onChange={(eventInput) => setNames((current) => { const next = [...current]; next[index] = eventInput.target.value; return next; })} className="field" placeholder="Nome do acompanhante" aria-label="Nome do acompanhante" data-testid={`input-participant-${index}`} />}</div>)}</div>}<label className="label mt-5">Uma observação (opcional)<textarea className="field min-h-20" value={note} onChange={(eventInput) => setNote(eventInput.target.value)} data-testid="input-rsvp-note" /></label><button className="public-modal-submit" disabled={respond.isPending} onClick={submitResponse} data-testid="button-submit-rsvp">{respond.isPending ? <Loader2 className="mx-auto animate-spin" size={15} /> : <><Check size={15} className="inline mr-2" /> Confirmar resposta</>}</button></div></div></div>}
    <Flash message={flash} />
  </main>;
}

function Dashboard() {
  const query = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const event = useGetEvent({ query: { queryKey: getGetEventQueryKey() } });
  const summary = query.data;
  const coupleLabel = event.data ? `${event.data.couple.name1} & ${event.data.couple.name2}` : 'Organizadores';
  return <AdminShell title="Visão geral" eyebrow={coupleLabel}>
    {query.isLoading ? <LoadingState label="Reunindo o pulso das confirmações" /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : summary ? <><div className="flex flex-wrap justify-between items-end gap-5 mb-9 fade-up"><div><div className="eyebrow">O pulso da celebração</div><h1 className="page-title mt-2">Olá, organizadores.</h1><p className="muted mt-2 text-sm">Veja como a lista está tomando forma para as Bodas de Ouro.</p></div><Link href="/admin/convidados" className="btn btn-primary" data-testid="button-manage-invites"><Users size={15} /> Gerenciar convidados</Link></div><div className="stat-grid fade-up d2">{[{ label: 'Convites enviados', value: summary.totalInvites, icon: Mail }, { label: 'Confirmados', value: summary.confirmedInvites, icon: CheckCircle2 }, { label: 'Pessoas confirmadas', value: summary.confirmedPeople, icon: Users }, { label: 'Aguardando resposta', value: summary.pendingInvites, icon: Clock3 }].map(({ label, value, icon: Icon }) => <div className="panel p-5" key={label}><div className="flex justify-between items-start"><span className="muted text-xs">{label}</span><Icon size={17} className="text-[hsl(var(--accent))]" /></div><div className="stat-value mt-5">{value}</div><div className="text-[11px] muted mt-2">{label === 'Confirmados' ? `${summary.declinedInvites} recusados até agora` : 'no total do evento'}</div></div>)}</div><div className="grid lg:grid-cols-[1.45fr_1fr] gap-5 mt-5"><div className="panel p-6 fade-up d3"><div className="flex justify-between items-center"><div><div className="eyebrow">Tendência</div><h2 className="serif text-2xl mt-1">Confirmações ao longo do tempo</h2></div><BarChart3 className="muted" size={20} /></div>{summary.confirmationTrend?.length ? <MiniChart points={summary.confirmationTrend.map((point) => point.count)} labels={summary.confirmationTrend.map((point) => shortDate(point.date))} /> : <EmptyState icon={BarChart3} title="Ainda sem tendência" detail="Assim que as respostas chegarem, o ritmo aparece aqui." />}</div><div className="panel p-6 fade-up d4"><div className="eyebrow">Atividade recente</div><h2 className="serif text-2xl mt-1">O que aconteceu</h2><div className="mt-5 space-y-4">{summary.recentActivity?.length ? summary.recentActivity.map((activity, index) => <div className="flex gap-3" key={`${activity.label}-${index}`} data-testid={`activity-${index}`}><div className="w-2 h-2 rounded-full bg-[hsl(var(--accent))] mt-1.5 shrink-0" /><div><div className="text-sm font-semibold">{activity.label}</div><div className="muted text-xs mt-0.5">{activity.detail}</div><div className="mono text-[9px] muted mt-1">{activity.time}</div></div></div>) : <p className="muted text-sm">As novas movimentações aparecerão aqui.</p>}</div></div></div>{event.data && <div className="panel mt-5 p-6 flex flex-wrap gap-5 items-center justify-between"><div className="flex items-center gap-4"><img src={event.data.heroImage} className="w-16 h-16 rounded-xl object-cover" alt="" /><div><div className="eyebrow">Próximo capítulo</div><div className="serif text-2xl mt-1">{event.data.couple.name1} & {event.data.couple.name2}</div><div className="muted text-xs mt-1">{dateLabel(event.data.eventDate)} · {event.data.venue}</div></div></div><Link href="/" className="btn btn-outline" data-testid="button-preview-invite">Pré-visualizar convite <ExternalLink size={14} /></Link></div>}</> : <EmptyState icon={BarChart3} title="Seu painel está pronto" detail="As métricas aparecerão quando o primeiro convite for respondido." />}
  </AdminShell>;
}
function MiniChart({ points, labels }: { points: number[]; labels: string[] }) {
  const max = Math.max(...points, 1);
  return <div className="mt-8"><div className="h-44 flex items-end gap-2 border-b border-[hsl(var(--border))]">{points.map((point, index) => <div key={index} className="flex-1 h-full flex flex-col justify-end items-center gap-2 group"><div className="w-full max-w-[30px] rounded-t bg-[hsl(var(--primary)/.8)] group-hover:bg-[hsl(var(--accent))] transition-colors" style={{ height: `${Math.max(8, (point / max) * 100)}%` }} title={`${point} confirmações`} /><span className="mono text-[8px] muted">{labels[index]}</span></div>)}</div><div className="flex justify-between text-[10px] muted mt-3"><span>Respostas</span><span>Últimas atualizações</span></div></div>;
}

function InvitesPage() {
  const query = useListInvites({ query: { queryKey: getListInvitesQueryKey() } });
  const create = useCreateInvite();
  const update = useUpdateInvite();
  const remove = useDeleteInvite();
  const client = useQueryClient();
  const { flash, notify } = useFlash();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modal, setModal] = useState<Invite | 'new' | null>(null);
  const invites = (query.data || []).filter((invite) => {
    const haystack = `${invite.name} ${invite.phone || ''} ${invite.internalNotes || ''} ${(invite.companions || []).map((companion) => companion.name).join(' ')}`.toLowerCase();
    return (!search || haystack.includes(search.toLowerCase())) && (statusFilter === 'all' || invite.status === statusFilter);
  });
  const saveInvite = (formData: InviteFormData) => {
    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      maxPeople: Math.max(1, Math.min(20, formData.maxPeople)),
      allowCompanions: formData.allowCompanions,
      companions: formData.allowCompanions
        ? formData.companions.slice(0, Math.max(0, formData.maxPeople - 1)).map((companion) => ({
          name: companion.name.trim(),
          relation: companion.name.trim() ? companion.relation.trim() || 'Acompanhante' : 'Acompanhante',
        }))
        : [],
      phone: formData.phone.trim(),
      internalNotes: formData.internalNotes.trim(),
    };
    if (modal === 'new') {
      create.mutate({ data: payload }, {
        onSuccess: () => { client.invalidateQueries({ queryKey: getListInvitesQueryKey() }); setModal(null); notify('Convite criado com sucesso.'); },
        onError: () => notify('Não conseguimos criar este convite agora.'),
      });
    } else if (modal) {
      update.mutate({ token: modal.token, data: payload }, {
        onSuccess: () => { client.invalidateQueries({ queryKey: getListInvitesQueryKey() }); setModal(null); notify('Dados do convite atualizados.'); },
        onError: () => notify('Não conseguimos salvar as alterações agora.'),
      });
    }
  };
  return <AdminShell title="Convidados" eyebrow="Lista de presença">
    <div className="flex flex-wrap justify-between items-end gap-5 mb-8"><div><div className="eyebrow">Sua lista, com clareza</div><h1 className="page-title mt-2">Convidados</h1><p className="muted text-sm mt-2">Crie, acompanhe e cuide de cada convite.</p></div><button className="btn btn-primary" onClick={() => setModal('new')} data-testid="button-create-invite"><Plus size={15} /> Novo convite</button></div>
    <div className="panel p-3 mb-4 flex flex-wrap gap-3 items-center"><div className="relative flex-1 min-w-[220px]"><Search size={15} className="absolute left-3 top-3 muted" /><input className="field pl-9" placeholder="Buscar por nome ou telefone" value={search} onChange={(eventInput) => setSearch(eventInput.target.value)} data-testid="input-search-invites" /></div><select className="field w-auto" value={statusFilter} onChange={(eventInput) => setStatusFilter(eventInput.target.value)} data-testid="select-invite-status"><option value="all">Todos os status</option><option value="pending">Aguardando</option><option value="confirmed">Confirmados</option><option value="declined">Recusados</option></select></div>
    {query.isLoading ? <LoadingState label="Carregando lista de convidados" /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : !invites.length ? <EmptyState icon={Users} title={search ? 'Nenhum encontro' : 'A lista começa aqui'} detail={search ? 'Tente outro nome ou remova o filtro.' : 'Crie o primeiro convite e dê forma à celebração.'} action={!search ? <button className="btn btn-primary mt-5" onClick={() => setModal('new')} data-testid="button-empty-create"><Plus size={14} /> Criar convite</button> : undefined} /> : <div className="panel table-wrap"><table className="data-table"><thead><tr><th>Convidado</th><th>Tipo</th><th>Composição</th><th>Status</th><th>Resposta</th><th /></tr></thead><tbody>{invites.map((invite) => <tr key={invite.token} data-testid={`row-invite-${invite.token}`}><td><div className="flex items-center gap-3"><div className="avatar">{initials(invite.name)}</div><div><div className="font-semibold">{invite.name}</div><div className="muted text-[11px]">{invite.phone || 'Sem telefone'}</div></div></div></td><td className="capitalize">{invite.type}</td><td><div className="font-medium">{invite.participants?.length || 0} / {invite.maxPeople} confirmados</div><div className="muted text-[10px] mt-1 max-w-[220px] truncate" title={(invite.companions || []).map(inviteCompanionLabel).join(', ')}>{invite.companions?.length ? invite.companions.map(inviteCompanionLabel).join(', ') : invite.allowCompanions && invite.maxPeople > 1 ? `${invite.maxPeople - 1} vagas para acompanhantes` : 'Somente convidado principal'}</div></td><td><span className={`badge ${invite.status}`}>{invite.status === 'confirmed' ? 'Confirmado' : invite.status === 'declined' ? 'Recusado' : 'Aguardando'}</span></td><td className="muted text-xs">{dateLabel(invite.respondedAt || undefined)}</td><td><div className="flex items-center justify-end gap-1"><button className="btn btn-quiet !p-2" title="Copiar link" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/convite/${invite.token}`); notify('Link copiado para a área de transferência.'); }} data-testid={`button-copy-${invite.token}`}><Copy size={14} /></button><button className="btn btn-quiet !p-2" title="Editar" onClick={() => setModal(invite)} data-testid={`button-edit-${invite.token}`}><Pencil size={14} /></button><button className="btn btn-danger !p-2" title="Excluir" onClick={() => { if (window.confirm(`Excluir o convite de ${invite.name}?`)) remove.mutate({ token: invite.token }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListInvitesQueryKey() }); notify('Convite excluído.'); } }); }} data-testid={`button-delete-${invite.token}`}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div>}
    {modal && <InviteModal value={modal === 'new' ? undefined : modal} busy={create.isPending || update.isPending} onClose={() => setModal(null)} onSubmit={saveInvite} />}<Flash message={flash} />
  </AdminShell>;
}

function InviteModal({ value, busy, onClose, onSubmit }: { value?: Invite; busy: boolean; onClose: () => void; onSubmit: (data: InviteFormData) => void }) {
  const [name, setName] = useState(value?.name || '');
  const [type, setType] = useState<InviteInputType>(value?.type || 'individual');
  const [maxPeople, setMaxPeople] = useState(value?.maxPeople || 1);
  const [allowCompanions, setAllowCompanions] = useState(Boolean(value?.allowCompanions));
  const [companions, setCompanions] = useState<CompanionDraft[]>(initialInviteCompanions(value));
  const [phone, setPhone] = useState(value?.phone || '');
  const [internalNotes, setInternalNotes] = useState(value?.internalNotes || '');
  const companionLimit = Math.max(0, maxPeople - 1);
  const canManageCompanions = allowCompanions && type !== 'individual' && companionLimit > 0;
  useEffect(() => { setCompanions((current) => current.slice(0, companionLimit)); }, [companionLimit]);
  const updateCompanion = (index: number, field: keyof CompanionDraft, nextValue: string) => setCompanions((current) => current.map((companion, companionIndex) => companionIndex === index ? { ...companion, [field]: nextValue } : companion));
  const setUndefinedCompanion = (index: number) => setCompanions((current) => current.map((companion, companionIndex) => companionIndex === index ? { name: '', relation: 'Acompanhante' } : companion));
  const addCompanion = () => { if (companions.length < companionLimit) setCompanions((current) => [...current, { name: '', relation: 'Acompanhante' }]); };
  const submit = (eventForm: FormEvent<HTMLFormElement>) => {
    eventForm.preventDefault();
    onSubmit({ name, type, maxPeople, allowCompanions: canManageCompanions, companions: canManageCompanions ? companions.slice(0, companionLimit) : [], phone, internalNotes });
  };
  return <div className="modal-backdrop"><div className="modal"><div className="p-6 border-b border-[hsl(var(--border))] flex justify-between"><div><div className="eyebrow">{value ? 'Editar convite' : 'Novo convite'}</div><h2 className="serif text-3xl mt-1">{value ? value.name : 'Adicionar convidado'}</h2></div><button className="btn btn-outline !p-2" onClick={onClose} data-testid="button-close-invite-modal"><X size={16} /></button></div><form className="p-6 space-y-5" onSubmit={submit}>
    <div><label className="label" htmlFor="input-invite-name">Nome do convidado principal</label><input id="input-invite-name" required minLength={2} value={name} onChange={(eventInput) => setName(eventInput.target.value)} className="field" placeholder="Ex. Marina e João" data-testid="input-invite-name" /></div>
    <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="select-invite-type">Tipo do convite</label><select id="select-invite-type" value={type} onChange={(eventInput) => setType(eventInput.target.value as InviteInputType)} className="field" data-testid="select-invite-type"><option value="individual">Individual</option><option value="couple">Casal</option><option value="family">Família</option><option value="group">Convidado + acompanhante</option></select></div><div><label className="label" htmlFor="input-invite-max">Máximo de pessoas</label><input id="input-invite-max" required type="number" min="1" max="20" value={maxPeople} onChange={(eventInput) => setMaxPeople(Math.max(1, Math.min(20, Number(eventInput.target.value) || 1)))} className="field" data-testid="input-invite-max" /></div></div>
    <div><label className="label" htmlFor="input-invite-phone">Telefone</label><input id="input-invite-phone" value={phone} onChange={(eventInput) => setPhone(eventInput.target.value)} className="field" placeholder="+55 (11) 99999-0000" data-testid="input-invite-phone" /></div>
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.28)] p-4"><label className="flex gap-2 items-start text-sm"><input id="input-invite-companions" type="checkbox" checked={allowCompanions} onChange={(eventInput) => setAllowCompanions(eventInput.target.checked)} className="mt-0.5" data-testid="input-invite-companions" /><span><strong>Acompanhantes permitidos</strong><span className="muted block text-xs mt-1">Defina os nomes conhecidos ou deixe uma vaga para o convidado completar.</span></span></label>{canManageCompanions && <div className="mt-4 space-y-3"><div className="flex items-center justify-between gap-3"><div><div className="label mb-0">Lista de acompanhantes</div><p className="muted text-xs">{companions.length} de {companionLimit} vagas configuradas</p></div><button type="button" className="btn btn-outline !py-2" onClick={addCompanion} disabled={companions.length >= companionLimit} data-testid="button-add-companion"><Plus size={14} /> Adicionar vaga</button></div>{companions.map((companion, index) => <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3" key={`companion-${index}`} data-testid={`row-companion-${index}`}><div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end"><div><label className="label" htmlFor={`input-admin-companion-name-${index}`}>Nome do acompanhante {index + 1}</label><input id={`input-admin-companion-name-${index}`} value={companion.name} onChange={(eventInput) => updateCompanion(index, 'name', eventInput.target.value)} className="field" placeholder="Nome completo" data-testid={`input-admin-companion-name-${index}`} /></div><div><label className="label" htmlFor={`input-admin-companion-relation-${index}`}>Relação</label><input id={`input-admin-companion-relation-${index}`} value={companion.relation} onChange={(eventInput) => updateCompanion(index, 'relation', eventInput.target.value)} className="field" placeholder="Ex. esposa" data-testid={`input-admin-companion-relation-${index}`} /></div><button type="button" className="btn btn-danger !p-2.5" onClick={() => setCompanions((current) => current.filter((_, companionIndex) => companionIndex !== index))} aria-label={`Remover acompanhante ${index + 1}`} title="Remover vaga" data-testid={`button-remove-companion-${index}`}><Trash2 size={14} /></button></div><button type="button" className="mt-3 text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-2" onClick={() => setUndefinedCompanion(index)} data-testid={`button-mark-companion-undefined-${index}`}>Marcar como acompanhante ainda não definido</button>{!companion.name && <div className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">Será salvo como uma vaga com relação “Acompanhante”.</div>}</div>)}</div>}{!canManageCompanions && allowCompanions && type === 'individual' && <p className="muted mt-3 text-xs">Convites individuais não exibem campos de acompanhantes.</p>}</div>
    <div><label className="label" htmlFor="input-invite-internal-notes">Observações internas do administrador</label><textarea id="input-invite-internal-notes" value={internalNotes} onChange={(eventInput) => setInternalNotes(eventInput.target.value)} className="field min-h-24" placeholder="Informações que só a organização deve ver..." data-testid="input-invite-internal-notes" /></div>
    <button className="btn btn-primary w-full mt-2" disabled={busy || !name.trim()} data-testid="button-submit-invite">{busy ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} {value ? 'Salvar alterações' : 'Criar convite'}</button></form></div></div>;
}

function LegacyInvitesPage() {
  const query = useListInvites({ query: { queryKey: getListInvitesQueryKey() } });
  const create = useCreateInvite(); const update = useUpdateInvite(); const remove = useDeleteInvite(); const client = useQueryClient(); const { flash, notify } = useFlash();
  const [search, setSearch] = useState(''); const [statusFilter, setStatusFilter] = useState('all'); const [modal, setModal] = useState<Invite | 'new' | null>(null);
  const invites = (query.data || []).filter((invite) => (!search || `${invite.name} ${invite.phone || ''}`.toLowerCase().includes(search.toLowerCase())) && (statusFilter === 'all' || invite.status === statusFilter));
  const saveInvite = (form: HTMLFormElement) => { const data = new FormData(form); const payload = { name: String(data.get('name')), type: String(data.get('type')) as InviteInputType, maxPeople: Number(data.get('maxPeople')), allowCompanions: data.get('allowCompanions') === 'on', phone: String(data.get('phone') || '') }; if (modal === 'new') create.mutate({ data: payload }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListInvitesQueryKey() }); setModal(null); notify('Convite criado com sucesso.'); } }); else if (modal) update.mutate({ token: modal.token, data: payload }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListInvitesQueryKey() }); setModal(null); notify('Dados do convite atualizados.'); } }); };
  return <AdminShell title="Convidados" eyebrow="Lista de presença"><div className="flex flex-wrap justify-between items-end gap-5 mb-8"><div><div className="eyebrow">Sua lista, com clareza</div><h1 className="page-title mt-2">Convidados</h1><p className="muted text-sm mt-2">Crie, acompanhe e cuide de cada convite.</p></div><button className="btn btn-primary" onClick={() => setModal('new')} data-testid="button-create-invite"><Plus size={15} /> Novo convite</button></div><div className="panel p-3 mb-4 flex flex-wrap gap-3 items-center"><div className="relative flex-1 min-w-[220px]"><Search size={15} className="absolute left-3 top-3 muted" /><input className="field pl-9" placeholder="Buscar por nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-invites" /></div><select className="field w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="select-invite-status"><option value="all">Todos os status</option><option value="pending">Aguardando</option><option value="confirmed">Confirmados</option><option value="declined">Recusados</option></select></div>{query.isLoading ? <LoadingState label="Carregando lista de convidados" /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : !invites.length ? <EmptyState icon={Users} title={search ? 'Nenhum encontro' : 'A lista começa aqui'} detail={search ? 'Tente outro nome ou remova o filtro.' : 'Crie o primeiro convite e dê forma à celebração.'} action={!search ? <button className="btn btn-primary mt-5" onClick={() => setModal('new')} data-testid="button-empty-create"><Plus size={14} /> Criar convite</button> : undefined} /> : <div className="panel table-wrap"><table className="data-table"><thead><tr><th>Convidado</th><th>Tipo</th><th>Convidados</th><th>Status</th><th>Resposta</th><th /></tr></thead><tbody>{invites.map((invite) => <tr key={invite.token} data-testid={`row-invite-${invite.token}`}><td><div className="flex items-center gap-3"><div className="avatar">{initials(invite.name)}</div><div><div className="font-semibold">{invite.name}</div><div className="muted text-[11px]">{invite.phone || 'Sem telefone'}</div></div></div></td><td className="capitalize">{invite.type}</td><td>{invite.participants?.length || 0} / {invite.maxPeople}</td><td><span className={`badge ${invite.status}`}>{invite.status === 'confirmed' ? 'Confirmado' : invite.status === 'declined' ? 'Recusado' : 'Aguardando'}</span></td><td className="muted text-xs">{dateLabel(invite.respondedAt || undefined)}</td><td><div className="flex items-center justify-end gap-1"><button className="btn btn-quiet !p-2" title="Copiar link" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/convite/${invite.token}`); notify('Link copiado para a área de transferência.'); }} data-testid={`button-copy-${invite.token}`}><Copy size={14} /></button><button className="btn btn-quiet !p-2" title="Editar" onClick={() => setModal(invite)} data-testid={`button-edit-${invite.token}`}><Pencil size={14} /></button><button className="btn btn-danger !p-2" title="Excluir" onClick={() => { if (window.confirm(`Excluir o convite de ${invite.name}?`)) remove.mutate({ token: invite.token }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListInvitesQueryKey() }); notify('Convite excluído.'); } }); }} data-testid={`button-delete-${invite.token}`}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div>}{modal && <LegacyInviteModal value={modal === 'new' ? undefined : modal} busy={create.isPending || update.isPending} onClose={() => setModal(null)} onSubmit={saveInvite} /> }<Flash message={flash} /></AdminShell>;
}
function LegacyInviteModal({ value, busy, onClose, onSubmit }: { value?: Invite; busy: boolean; onClose: () => void; onSubmit: (form: HTMLFormElement) => void }) {
  return <div className="modal-backdrop"><div className="modal"><div className="p-6 border-b border-[hsl(var(--border))] flex justify-between"><div><div className="eyebrow">{value ? 'Editar convite' : 'Novo convite'}</div><h2 className="serif text-3xl mt-1">{value ? value.name : 'Adicionar convidado'}</h2></div><button className="btn btn-outline !p-2" onClick={onClose} data-testid="button-close-invite-modal"><X size={16} /></button></div><form className="p-6 space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(e.currentTarget); }}><div><label className="label">Nome do convite</label><input required minLength={2} name="name" defaultValue={value?.name || ''} className="field" placeholder="Ex. Marina e João" data-testid="input-invite-name" /></div><div className="grid grid-cols-2 gap-3"><div><label className="label">Tipo</label><select name="type" defaultValue={value?.type || 'individual'} className="field" data-testid="select-invite-type"><option value="individual">Individual</option><option value="couple">Casal</option><option value="family">Família</option><option value="group">Grupo</option></select></div><div><label className="label">Máximo de pessoas</label><input required type="number" min="1" max="20" name="maxPeople" defaultValue={value?.maxPeople || 1} className="field" data-testid="input-invite-max" /></div></div><div><label className="label">Telefone</label><input name="phone" defaultValue={value?.phone || ''} className="field" placeholder="+55 (11) 99999-0000" data-testid="input-invite-phone" /></div><label className="flex gap-2 items-center text-sm"><input type="checkbox" name="allowCompanions" defaultChecked={value?.allowCompanions} data-testid="input-invite-companions" /> Permitir acompanhantes</label><button className="btn btn-primary w-full mt-2" disabled={busy} data-testid="button-submit-invite">{busy ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} {value ? 'Salvar alterações' : 'Criar convite'}</button></form></div></div>;
}

function CheckinPage() {
  const invites = useListInvites({ query: { queryKey: getListInvitesQueryKey() } }); const checkins = useListCheckins({ query: { queryKey: getListCheckinsQueryKey() } }); const create = useCreateCheckin(); const client = useQueryClient(); const { flash, notify } = useFlash(); const [search, setSearch] = useState(''); const [selected, setSelected] = useState<Invite | null>(null); const [present, setPresent] = useState(1);
  const results = (invites.data || []).filter((item) => item.status === 'confirmed' && (`${item.name} ${item.phone || ''} ${item.token}`).toLowerCase().includes(search.toLowerCase())).slice(0, 5);
  const checkIn = () => { if (!selected) return; create.mutate({ token: selected.token, data: { presentPeople: present } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListCheckinsQueryKey() }); setSelected(null); setSearch(''); notify(`${selected.name} fez check-in.`); } }); };
  return <AdminShell title="Check-in" eyebrow="No dia da celebração"><div className="mb-8"><div className="eyebrow">Recepção tranquila</div><h1 className="page-title mt-2">Quem chegou?</h1><p className="muted text-sm mt-2">Encontre a confirmação e registre a chegada em segundos.</p></div><div className="grid lg:grid-cols-[1.1fr_.9fr] gap-5"><div className="panel p-6"><div className="flex items-center gap-3 mb-5"><div className="brand-mark !w-10 !h-10"><UserCheck size={18} /></div><div><h2 className="serif text-2xl">Buscar convidado</h2><p className="muted text-xs">Nome, telefone ou código do convite</p></div></div><div className="relative"><Search size={16} className="absolute left-3 top-3.5 muted" /><input autoFocus className="field pl-10" value={search} onChange={(e) => { setSearch(e.target.value); setSelected(null); }} placeholder="Comece a digitar..." data-testid="input-checkin-search" /></div>{search && !selected && <div className="mt-3 border border-[hsl(var(--border))] rounded-lg overflow-hidden">{results.length ? results.map((invite) => <button key={invite.token} className="w-full text-left p-3 flex items-center gap-3 hover:bg-[hsl(var(--secondary))] border-b border-[hsl(var(--border))] last:border-0" onClick={() => { setSelected(invite); setPresent(invite.participants.length || 1); }} data-testid={`button-select-checkin-${invite.token}`}><div className="avatar">{initials(invite.name)}</div><div><div className="text-sm font-semibold">{invite.name}</div><div className="muted text-xs">{invite.participants.length} confirmados · código {invite.token}</div></div><ArrowRight size={14} className="ml-auto muted" /></button>) : <div className="p-5 muted text-sm">Nenhum confirmado encontrado.</div>}</div>}{selected && <div className="mt-5 border border-[hsl(var(--accent)/.5)] rounded-xl p-5 bg-[hsl(var(--accent)/.08)]"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="avatar">{initials(selected.name)}</div><div><div className="font-semibold">{selected.name}</div><div className="muted text-xs">{selected.participants.length} pessoas confirmadas</div></div></div><button className="btn btn-outline !p-2" onClick={() => setSelected(null)} data-testid="button-clear-checkin"><X size={14} /></button></div><div className="mt-6"><label className="label">Pessoas presentes</label><div className="flex items-center gap-3"><button className="btn btn-outline !w-10 !p-2" onClick={() => setPresent(Math.max(1, present - 1))} data-testid="button-decrease-present">−</button><div className="serif text-3xl w-12 text-center">{present}</div><button className="btn btn-outline !w-10 !p-2" onClick={() => setPresent(Math.min(selected.maxPeople, present + 1))} data-testid="button-increase-present">+</button><span className="muted text-xs ml-2">de {selected.maxPeople} possíveis</span></div></div><button className="btn btn-primary w-full mt-6" onClick={checkIn} disabled={create.isPending} data-testid="button-confirm-checkin">{create.isPending ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Confirmar chegada</button></div>}</div><div className="panel p-6"><div className="flex justify-between items-center"><div><div className="eyebrow">Ao vivo</div><h2 className="serif text-2xl mt-1">Últimas chegadas</h2></div><span className="badge approved"><span className="w-1.5 h-1.5 rounded-full bg-current" /> Atualizado</span></div><div className="mt-5">{checkins.isLoading ? <div className="space-y-3"><div className="skeleton h-14" /><div className="skeleton h-14" /></div> : checkins.data?.length ? <div className="space-y-3">{checkins.data.slice(0, 8).map((item) => <div key={item.id} className="flex justify-between items-center border-b border-[hsl(var(--border))] pb-3" data-testid={`checkin-row-${item.id}`}><div><div className="font-semibold text-sm">{item.guestName}</div><div className="muted text-xs">{item.presentPeople} presentes de {item.confirmedPeople}</div></div><div className="mono text-[10px] muted">{timeLabel(item.checkedInAt)}</div></div>)}</div> : <EmptyState icon={UserCheck} title="A pista está esperando" detail="As primeiras chegadas aparecerão neste painel." />}</div></div></div><Flash message={flash} /></AdminShell>;
}

function MessagesPage() {
  const query = useListMessages({ query: { queryKey: getListMessagesQueryKey() } }); const update = useUpdateMessage(); const client = useQueryClient(); const { flash, notify } = useFlash(); const [filter, setFilter] = useState('all');
  const messages = (query.data || []).filter((message) => filter === 'all' || message.status === filter);
  const moderate = (message: GuestMessage, status: 'approved' | 'private' | 'pending') => update.mutate({ id: message.id, data: { status } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListMessagesQueryKey() }); notify(status === 'approved' ? 'Mensagem publicada no mural.' : 'Visibilidade da mensagem atualizada.'); } });
  return <AdminShell title="Mensagens" eyebrow="Mural de carinho"><div className="flex flex-wrap justify-between items-end gap-5 mb-8"><div><div className="eyebrow">Palavras para guardar</div><h1 className="page-title mt-2">Mensagens</h1><p className="muted text-sm mt-2">Escolha o que fica visível para todos.</p></div><div className="flex gap-2">{['all', 'pending', 'approved', 'private'].map((item) => <button key={item} className={`btn ${filter === item ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(item)} data-testid={`button-filter-message-${item}`}>{item === 'all' ? 'Todas' : item === 'pending' ? 'Pendentes' : item === 'approved' ? 'Publicadas' : 'Privadas'}</button>)}</div></div>{query.isLoading ? <LoadingState label="Buscando mensagens dos convidados" /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : !messages.length ? <EmptyState icon={MessageCircle} title="Nenhuma mensagem por aqui" detail="Quando os convidados deixarem um recado, você poderá cuidar dele aqui." /> : <div className="grid md:grid-cols-2 gap-4">{messages.map((message) => <article className="panel panel-hover p-5" key={message.id} data-testid={`card-message-${message.id}`}><div className="flex justify-between items-start gap-4"><div className="flex items-center gap-3"><div className="avatar">{initials(message.author)}</div><div><div className="font-semibold text-sm">{message.author}</div><div className="muted text-[10px] mono mt-1">{dateLabel(message.createdAt)}</div></div></div><span className={`badge ${message.status}`}>{message.status === 'approved' ? 'Publicada' : message.status === 'private' ? 'Privada' : 'Pendente'}</span></div><p className="serif text-xl leading-snug mt-6">“{message.message}”</p><div className="flex gap-2 mt-6 pt-4 border-t border-[hsl(var(--border))]">{message.status !== 'approved' && <button className="btn btn-primary" onClick={() => moderate(message, 'approved')} data-testid={`button-approve-message-${message.id}`}><Check size={14} /> Publicar</button>}{message.status !== 'private' && <button className="btn btn-quiet" onClick={() => moderate(message, 'private')} data-testid={`button-private-message-${message.id}`}><Archive size={14} /> Manter privada</button>}{message.status !== 'pending' && <button className="btn btn-outline !p-2 ml-auto" title="Voltar para pendentes" onClick={() => moderate(message, 'pending')} data-testid={`button-pending-message-${message.id}`}><Clock3 size={14} /></button>}</div></article>)}</div>}<Flash message={flash} /></AdminShell>;
}

function SettingsPage() {
  const eventQuery = useGetEvent({ query: { queryKey: getGetEventQueryKey() } }); const update = useUpdateEvent(); const client = useQueryClient(); const { flash, notify } = useFlash(); const [tab, setTab] = useState('evento'); const [saved, setSaved] = useState(false); const event = eventQuery.data;
  const tabs = [{ id: 'evento', label: 'Evento', icon: CalendarDays }, { id: 'historia', label: 'História', icon: Heart }, { id: 'galeria', label: 'Galeria', icon: ImageIcon }, { id: 'aparencia', label: 'Aparência', icon: Sparkles }];
  return <AdminShell title="Configurações" eyebrow="A identidade da celebração"><div className="mb-8"><div className="eyebrow">Tudo no seu tom</div><h1 className="page-title mt-2">Configurações</h1><p className="muted text-sm mt-2">Ajuste os detalhes que fazem o convite ser de vocês.</p></div><div className="grid lg:grid-cols-[220px_1fr] gap-6"><div className="panel p-2 h-fit">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={`w-full flex items-center gap-3 p-3 rounded-lg text-sm text-left ${tab === id ? 'bg-[hsl(var(--secondary))] font-semibold text-[hsl(var(--primary))]' : 'muted hover:bg-[hsl(var(--secondary)/.5)]'}`} onClick={() => setTab(id)} data-testid={`button-settings-${id}`}><Icon size={16} /> {label}</button>)}</div><div className="panel p-6 md:p-8">{eventQuery.isLoading ? <LoadingState /> : event ? <form onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); update.mutate({ data: { couple: { ...event.couple, name1: String(form.get('name1') || event.couple.name1), name2: String(form.get('name2') || event.couple.name2) }, eventDate: String(form.get('eventDate') || event.eventDate), eventTime: String(form.get('eventTime') || event.eventTime), venue: String(form.get('venue') || event.venue), address: String(form.get('address') || event.address), heroImage: event.heroImage, mapUrl: event.mapUrl || '', message: String(form.get('message') || event.message), dressCode: String(form.get('dressCode') || event.dressCode || '') || null, timeline: event.timeline, gallery: event.gallery } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetEventQueryKey() }); setSaved(true); notify('Detalhes do evento salvos no banco.'); window.setTimeout(() => setSaved(false), 2000); } }); }}><div className="flex justify-between items-start gap-4 border-b border-[hsl(var(--border))] pb-5 mb-6"><div><div className="eyebrow">{tabs.find((item) => item.id === tab)?.label}</div><h2 className="serif text-3xl mt-1">{tab === 'evento' ? 'Os detalhes do dia' : tab === 'historia' ? 'A narrativa de vocês' : tab === 'galeria' ? 'Imagens que ficam' : 'O clima do convite'}</h2></div><button className="btn btn-primary" type="submit" disabled={update.isPending} data-testid="button-save-settings">{saved ? <Check size={14} /> : null} {update.isPending ? 'Salvando' : saved ? 'Salvo' : 'Salvar alterações'}</button></div>{tab === 'evento' && <div className="grid md:grid-cols-2 gap-5"><div><label className="label">Nome 1</label><input name="name1" className="field" defaultValue={event.couple.name1} data-testid="input-couple-name1" /></div><div><label className="label">Nome 2</label><input name="name2" className="field" defaultValue={event.couple.name2} data-testid="input-couple-name2" /></div><div><label className="label">Data do evento</label><input name="eventDate" className="field" type="date" defaultValue={event.eventDate.slice(0, 10)} data-testid="input-event-date" /></div><div><label className="label">Horário</label><input name="eventTime" className="field" defaultValue={event.eventTime} data-testid="input-event-time" /></div><div><label className="label">Local</label><input name="venue" className="field" defaultValue={event.venue} data-testid="input-event-venue" /></div><div><label className="label">Dress code</label><input name="dressCode" className="field" defaultValue={event.dressCode || ''} data-testid="input-dress-code" /></div><div className="md:col-span-2"><label className="label">Endereço</label><input name="address" className="field" defaultValue={event.address} data-testid="input-event-address" /></div></div>}{tab === 'historia' && <div className="space-y-6">{event.timeline.map((item) => <div className="border-b border-[hsl(var(--border))] pb-5" key={item.id}><div className="grid grid-cols-[100px_1fr] gap-4"><input className="field" defaultValue={item.year} /><div><input className="field" defaultValue={item.title} /><textarea className="field mt-2 min-h-20" defaultValue={item.description} /></div></div></div>)}</div>}{tab === 'galeria' && <div><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{event.gallery.map((image) => <div key={image.id} className="aspect-square rounded-xl overflow-hidden relative group"><img src={image.imageUrl} alt={image.alt} className="w-full h-full object-cover" /><button type="button" className="absolute right-2 top-2 btn btn-danger !p-2 opacity-0 group-hover:opacity-100" data-testid={`button-delete-gallery-${image.id}`}><Trash2 size={14} /></button></div>)}</div><button type="button" className="btn btn-outline mt-5" data-testid="button-add-gallery"><Plus size={14} /> Adicionar imagem</button></div>}{tab === 'aparencia' && <div><div className="label">Paleta do convite</div><div className="grid grid-cols-3 gap-3"><button type="button" className="h-24 rounded-xl border-2 border-[hsl(var(--primary))] bg-[#281d2b] text-[#d6af62] text-xs" data-testid="button-theme-plum">Ameixa & Ouro</button><button type="button" className="h-24 rounded-xl border border-[hsl(var(--border))] bg-[#e5e0d5] text-[#31493d] text-xs" data-testid="button-theme-sage">Sálvia & Linho</button><button type="button" className="h-24 rounded-xl border border-[hsl(var(--border))] bg-[#273443] text-[#d9b47a] text-xs" data-testid="button-theme-ink">Azul & Champanhe</button></div><div className="mt-8"><label className="label">Mensagem de abertura</label><textarea name="message" className="field min-h-28" defaultValue={event.message || ''} data-testid="input-event-message" /></div></div>}</form> : <ErrorState onRetry={() => eventQuery.refetch()} />}</div></div><Flash message={flash} /></AdminShell>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/"><Invitation token={demoToken} /></Route><Route path="/convite/:token"><InviteRoute /></Route><Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} /><Route path="/admin"><ProtectedDashboard /></Route><Route path="/admin/convidados"><ProtectedInvites /></Route><Route path="/admin/checkin"><ProtectedCheckin /></Route><Route path="/admin/mensagens"><ProtectedMessages /></Route><Route path="/admin/configuracoes"><ProtectedSettings /></Route><Route component={NotFound} /></Switch></ErrorBoundary>;
}
function InviteRoute() { const params = useParams<{ token: string }>(); return <Invitation token={params.token || demoToken} />; }
function AdminGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="min-h-screen grid place-items-center bg-[#f4ecdf]"><LoadingState label="Abrindo o espaço dos organizadores" /></div>;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <>{children}</>;
}
function ProtectedDashboard() { return <AdminGate><Dashboard /></AdminGate>; }
function ProtectedInvites() { return <AdminGate><InvitesPage /></AdminGate>; }
function ProtectedCheckin() { return <AdminGate><CheckinPage /></AdminGate>; }
function ProtectedMessages() { return <AdminGate><MessagesPage /></AdminGate>; }
function ProtectedSettings() { return <AdminGate><SettingsPage /></AdminGate>; }
function SignInPage() { return <div className="min-h-screen grid place-items-center bg-[#f4ecdf] px-4"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>; }
function SignUpPage() { return <div className="min-h-screen grid place-items-center bg-[#f4ecdf] px-4"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>; }
function ClerkApp() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={{ theme: shadcn, cssLayerName: 'clerk', options: { logoPlacement: 'inside', logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` }, variables: { colorPrimary: '#922f4f', colorForeground: '#2c2230', colorMutedForeground: '#755f6d', colorBackground: '#f4ecdf', colorInput: '#fffaf2', colorInputForeground: '#2c2230', colorNeutral: '#d8cbb9', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.75rem' } }} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}><Router /></ClerkProvider>;
}
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ClerkApp /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;