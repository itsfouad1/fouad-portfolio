import { useState, useEffect } from 'react';
import './styles.css';
import {Admin, api} from './Admin';
import seed from '../server/seed.json';
import {Resume} from './Resume';
import {ProfileCard} from './ProfileCard';
import {Contact} from './Contact';
import {Experience,CaseStudies} from './RichContent';
import {Skills,Process} from './Skills';
import {ProjectDetail,safeUrl} from './ProjectDetail';

export function App() {
  return location.pathname.startsWith("/admin") ? <Admin/> : <Portfolio/>;
}
function Portfolio() {
  const [content,setContent]=useState(seed);
  const [contentError,setContentError]=useState('');
  useEffect(()=>{api(new URLSearchParams(location.search).has("preview") ? "/api/admin" : "/api/content").then(x=>setContent(x.draft||x)).catch(()=>{setContentError(new URLSearchParams(location.search).has("preview")?"Draft preview requires signing in to the dashboard. The content below is the starter version.":"Live content could not be loaded. Showing the starter version. Check that the Node server is running.")});},[]);
  const profile=content.profile;
  const projects=content.projects;
  const [active, setActive] = useState(null);
  const [resumeOpen,setResumeOpen]=useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  return <main>{contentError&&<p className="content-alert" role="alert">{contentError}</p>}
    <header className="topbar"><a className="monogram" href="#home">FA<span>|</span></a><nav className={menuOpen ? "nav-open" : ""} onClick={()=>setMenuOpen(false)}><a href="#home">Home</a><a href="#experience">Experience</a><a href="#case-studies">Case studies</a><a href="#skills">Skills</a><a href="#about">About</a><a href="#inquiry">Contact</a><button className="nav-resume" onClick={()=>{setResumeOpen(true);setMenuOpen(false)}}>Resume ↗</button></nav><button className="menu" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen ? "Close" : "Menu"}</button></header>
    <section className="hero" id="home">
      <div className="hero-copy"><p className="name">{profile.name}</p><p className="role">{profile.role}</p><i className="accent-line"/><h1>{profile.headline}</h1><p className="intro">{profile.intro}</p><p className="hero-overview">{profile.overview}</p><div className="hero-focus">{(profile.focus||'').split('·').filter(Boolean).map((t,i)=><span key={i}>{t.trim()}</span>)}</div><div className="actions"><a className="button primary" href="#projects">View projects</a><a className="button" href={`mailto:${profile.email}`}>Contact</a></div><div className="hero-social">{[["GitHub",profile.github],["LinkedIn",profile.linkedin],["Instagram",profile.instagram]].map(([label,url])=>safeUrl(url)?<a key={label} href={safeUrl(url)} target="_blank" rel="noreferrer">{label} ↗</a>:null)}<button className="hero-resume" onClick={()=>setResumeOpen(true)}>View CV ↗</button></div><div className="micro-motion"><span/><span/></div></div>
      <ProfileCard profile={profile}/>
      <a className="scroll-cue" href="#projects" aria-label="Scroll to projects"><span>↓</span></a>
    </section>
    <section className="projects" id="projects" aria-label="Selected projects">{projects.map((p,i)=><button className="project" key={i} onClick={()=>setActive(i)} aria-label={`Explore ${p.name}`}><span className="project-title"><b>{p.name}</b><em>/</em>{p.type}</span><small className="project-status">{p.status}</small><span className="project-arrow">↗</span></button>)}</section>
    {resumeOpen&&<Resume profile={profile} onClose={()=>setResumeOpen(false)}/>}
    {active!==null&&projects[active]&&<ProjectDetail project={projects[active]} onClose={()=>setActive(null)}/>}
    <Experience items={content.experiences||seed.experiences}/><CaseStudies projects={projects} onProject={setActive}/>
    <section className="skills-section" id="skills"><p className="eyebrow">TOOLS & APPROACH</p><h2>Built with intention.</h2><Skills skills={content.skills} projects={projects} onProject={setActive}/></section>{content.certificates?.length>0&&<section className="certificates-section"><p className="eyebrow">LEARNING & CREDENTIALS</p><h2>Always building my skills.</h2><div className="certificate-grid">{content.certificates.map((c,i)=><article key={i}><small>{c.date}</small><h3>{c.title}</h3><p>{c.issuer}</p>{safeUrl(c.url)&&<a href={safeUrl(c.url)} target="_blank" rel="noreferrer">View credential ↗</a>}</article>)}</div></section>}<Process/><section className="about" id="about"><p className="eyebrow">A LITTLE ABOUT ME</p><h2>Thoughtful systems.<br/><span>Useful outcomes.</span></h2><p>{profile.about}</p><a href="#inquiry" className="text-link" id="contact">Let’s build something useful <span>↗</span></a></section>
    <Contact profile={profile}/><footer><span>FOUAD AL-SHAMI</span><span>BACKEND DEVELOPER · GAZA, PALESTINE</span><div><a href={`mailto:${profile.email}`}>Email</a><a href={safeUrl(profile.github)} target="_blank" rel="noreferrer">GitHub</a></div></footer>
  </main>;
}
