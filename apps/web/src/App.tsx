import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';

import { BrandTemplatePage } from './brand-template/BrandTemplatePage';
import { DemoBuilderPage } from './demos/DemoBuilderPage';
import { EvidenceReviewPage } from './review/EvidenceReviewPage';
import { ProspectsPage } from './prospects/ProspectsPage';
import { Phase19QaPage } from './qa/Phase19QaPage';
import { ResearchPage } from './research/ResearchPage';
import { SalonTemplatePreview } from './salon/SalonTemplatePreview';
import { ScoringPage } from './scoring/ScoringPage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

interface AuthUser { id: string; email: string; name: string }
interface SessionResponse { user: AuthUser }

const navItems = [
  { to: '/dashboard', label: 'Command Center', short: 'CC' },
  { to: '/campaigns', label: 'Campaigns', short: 'CA' },
  { to: '/prospects', label: 'Prospects', short: 'PR' },
  { to: '/research', label: 'Research', short: 'RE' },
  { to: '/evidence-review', label: 'Evidence Review', short: 'EV' },
  { to: '/scoring', label: 'Scoring', short: 'SC' },
  { to: '/templates', label: 'Templates', short: 'TE' },
  { to: '/demos', label: 'Demos', short: 'DE' },
  { to: '/qa', label: 'QA Queue', short: 'QA' },
  { to: '/outreach', label: 'Outreach', short: 'OU' },
  { to: '/inbox', label: 'Inbox', short: 'IN' },
  { to: '/pipeline', label: 'Pipeline', short: 'PI' },
  { to: '/analytics', label: 'Analytics', short: 'AN' },
] as const;

async function loadSession(): Promise<AuthUser | null> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/session`, { credentials: 'include' });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Unable to load your Shalcon session.');
  return ((await response.json()) as SessionResponse).user;
}

function LoadingState() {
  return <main className="center-state" aria-busy="true" aria-label="Loading workspace"><div className="loading-mark" aria-hidden="true" /><p className="eyebrow">SHALCON INTELLIGENCE</p><h1>Preparing workspace</h1><p>Verifying your secure session.</p></main>;
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <main className="center-state" role="alert"><p className="eyebrow">SYSTEM STATE</p><h1>Workspace unavailable</h1><p>The dashboard could not reach the API safely. Nothing was changed.</p><button className="primary-button" type="button" onClick={onRetry}>Retry connection</button></main>;
}
function LoginPage() {
  const loginUrl = `${API_BASE_URL}/api/v1/auth/google/start?return_to=${encodeURIComponent('/dashboard')}`;
  return <main className="login-shell"><section className="login-panel" aria-labelledby="login-title"><div><p className="eyebrow">SHALCON INTELLIGENCE / PRIVATE OPERATOR</p><h1 id="login-title">Demo-First Outbound Engine</h1><p className="lede">One controlled workspace for evidence, private demos, QA, outreach, and the sales handoff.</p></div><div className="login-action"><a className="primary-button" href={loginUrl}>Continue with Google</a><p>Access is session-protected. No Google password is handled by Shalcon.</p></div></section></main>;
}

function DashboardPage() {
  return <div className="page-stack"><section className="dashboard-hero"><div><p className="eyebrow">COMMAND CENTER</p><h2>Revenue mechanism first.</h2><p className="page-copy">Evidence-backed research, deterministic demo generation, visual QA, and fact validation now converge at the human sales-readiness gate.</p></div><span className="system-chip">Core online</span></section><section className="metric-grid" aria-label="Workspace readiness"><article className="metric-card"><span>Foundation</span><strong>Green</strong><small>Engineering + CI</small></article><article className="metric-card"><span>Template</span><strong>ÉLANE</strong><small>Salon master v8</small></article><article className="metric-card"><span>Current phase</span><strong>20</strong><small>Accuracy Trial</small></article></section><section className="flow-panel"><div className="section-heading"><div><p className="eyebrow">MONEY LOOP</p><h3>Evidence-backed sales production</h3></div><span>Accuracy first</span></div><div className="flow-line" aria-label="Current sales flow">{['Prospect','Identity','Research','Audit','Score','Match','Demo','QA'].map((step,index)=><div className="flow-step" key={step}><small>{String(index+1).padStart(2,'0')}</small><span>{step}</span></div>)}</div></section></div>;
}

function EmptyModulePage({ title, description }: { title: string; description: string }) {
  return <section className="empty-state" aria-labelledby="module-title"><div className="empty-index" aria-hidden="true">00</div><p className="eyebrow">MODULE READY</p><h2 id="module-title">{title}</h2><p>{description}</p><div className="empty-rule" /><small>This module will activate in its master-plan phase. No fake records are shown.</small></section>;
}
const moduleCopy: Record<string,string> = {
  Campaigns:'Campaign targeting, limits, approval policy, and lifecycle controls.',
  Research:'Source-backed business research and website audit evidence.', Templates:'Versioned niche templates and their visual DNA.', Demos:'Private configuration-driven prospect demos and asset status.', 'QA Queue':'Fact, visual, sales, and send-readiness quality gates.', Outreach:'Approved messages, controlled sends, and follow-up state.', Inbox:'Reply classification and operator handoff.', Pipeline:'Human sales stages after a qualified response.', Analytics:'Accuracy, demo, outreach, reply, and revenue-loop diagnostics.'
};

function DashboardShell({ user }: { user: AuthUser }) {
  const [mobileOpen,setMobileOpen]=useState(false); const location=useLocation(); const queryClient=useQueryClient();
  const active=navItems.find((item)=>item.to===location.pathname)??navItems[0];
  async function logout(){await fetch(`${API_BASE_URL}/api/v1/auth/logout`,{method:'POST',credentials:'include'});queryClient.setQueryData(['auth-session'],null);}
  const placeholderItems=navItems.slice(1).filter((item)=>item.to!=='/prospects'&&item.to!=='/research'&&item.to!=='/evidence-review'&&item.to!=='/scoring'&&item.to!=='/templates'&&item.to!=='/demos'&&item.to!=='/qa');
  return <div className="dashboard-shell"><aside id="mobile-navigation" className={`sidebar ${mobileOpen?'is-open':''}`} aria-label="Primary navigation"><div className="brand-lockup"><span className="brand-mark">S</span><div><strong>SHALCON</strong><small>Outbound Engine</small></div></div><nav className="nav-stack">{navItems.map((item)=><NavLink aria-label={item.label} className={({isActive})=>`nav-link ${isActive?'active':''}`} key={item.to} onClick={()=>setMobileOpen(false)} to={item.to}><span>{item.short}</span>{item.label}</NavLink>)}</nav><div className="sidebar-footer"><div className="operator-block"><span>{user.name.slice(0,1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div><button className="text-button" type="button" onClick={()=>void logout()}>Sign out</button></div></aside>{mobileOpen?<button className="mobile-scrim" aria-label="Close navigation" type="button" onClick={()=>setMobileOpen(false)}/>:null}<div className="workspace"><header className="topbar"><button className="menu-button" aria-expanded={mobileOpen} aria-controls="mobile-navigation" type="button" onClick={()=>setMobileOpen((open)=>!open)}>Menu</button><div><small>Workspace /</small><strong>{active.label}</strong></div><div className="topbar-status"><span aria-hidden="true"/>System online</div></header><main className="workspace-main"><Routes><Route path="/" element={<Navigate to="/dashboard" replace/>}/><Route path="/dashboard" element={<DashboardPage/>}/><Route path="/prospects" element={<ProspectsPage/>}/><Route path="/research" element={<ResearchPage/>}/><Route path="/evidence-review" element={<EvidenceReviewPage/>}/><Route path="/scoring" element={<ScoringPage/>}/><Route path="/templates" element={<BrandTemplatePage/>}/><Route path="/demos" element={<DemoBuilderPage/>}/><Route path="/qa" element={<Phase19QaPage/>}/>{placeholderItems.map((item)=><Route key={item.to} path={item.to} element={<EmptyModulePage title={item.label} description={moduleCopy[item.label]??'Module activation is pending.'}/>}/>) }<Route path="*" element={<Navigate to="/dashboard" replace/>}/></Routes></main></div></div>;
}

class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{override state={failed:false};override componentDidCatch(error:Error,info:ErrorInfo){console.error('Dashboard render failure',{name:error.name,componentStack:info.componentStack});}override render(){if(this.state.failed)return <ErrorState onRetry={()=>this.setState({failed:false})}/>;return this.props.children;}static getDerivedStateFromError(){return{failed:true};}}
function AuthenticatedApp(){const session=useQuery({queryKey:['auth-session'],queryFn:loadSession,retry:false,staleTime:30_000});if(session.isPending)return <LoadingState/>;if(session.isError)return <ErrorState onRetry={()=>void session.refetch()}/>;if(!session.data)return <LoginPage/>;return <DashboardShell user={session.data}/>;}
function PublicTemplatePreview(){return <SalonTemplatePreview/>;}
export function App(){const location=useLocation();return <AppErrorBoundary>{location.pathname==='/template-preview/salon-v1'?<PublicTemplatePreview/>:<AuthenticatedApp/>}</AppErrorBoundary>;}
