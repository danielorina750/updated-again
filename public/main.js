const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];

const header = $('.site-header');
window.addEventListener('scroll', () => header && header.classList.toggle('scrolled', window.scrollY > 40));

const navToggle = $('.nav-toggle');
const nav = $('.main-nav');
if (navToggle && nav) {
  navToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  $$('.main-nav a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
}

const glow = $('.cursor-glow');
window.addEventListener('pointermove', e => {
  if (!glow) return;
  glow.style.left = `${e.clientX}px`;
  glow.style.top = `${e.clientY}px`;
});

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
}, { threshold: 0.12 });
$$('.reveal').forEach(el => revealObserver.observe(el));

const counterObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting || entry.target.dataset.done) return;
    entry.target.dataset.done = 'true';
    const end = Number(entry.target.dataset.count || 0);
    const duration = 1350;
    const start = performance.now();
    function tick(now){
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1-p, 3);
      entry.target.textContent = Math.round(end * eased).toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}, { threshold: 0.4 });
$$('[data-count]').forEach(el => counterObserver.observe(el));

let PROJECTS = [];
let activeFilter = 'All';
const filterBar = $('#filterBar');
const projectGrid = $('#projectGrid');
const sectorBars = $('#sectorBars');
const portfolioSyncNote = $('#portfolioSyncNote');

function isSupabaseReady(){
  const cfg = window.SIEN_SUPABASE_CONFIG || {};
  return !!(cfg.url && cfg.anonKey && !cfg.url.includes('YOUR_PROJECT_ID') && !cfg.anonKey.includes('YOUR_SUPABASE'));
}

function fallbackProjects(){
  try { return typeof SIEN_PROJECTS !== 'undefined' ? [...SIEN_PROJECTS] : []; }
  catch { return []; }
}

function slugify(value){
  return String(value || 'project').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

function normalizeDbProject(row){
  const gallery = Array.isArray(row.gallery_images) ? row.gallery_images : [];
  const highlights = Array.isArray(row.highlights)
    ? row.highlights
    : String(row.highlights || '').split('\n').map(x => x.trim()).filter(Boolean);
  const image = row.main_image_url || gallery[0] || 'assets/brand/hero-urban.jpg';
  return {
    slug: row.slug || slugify(row.title),
    title: row.title || 'Untitled Project',
    category: row.category || 'Residential',
    status: row.status || 'Design Phase',
    location: row.location || 'Kenya',
    year: row.year || '',
    size: row.size || '',
    image,
    gallery: gallery.length ? gallery : [image],
    description: row.description || row.short_description || '',
    scope: row.scope || row.scope_of_work || '',
    highlights: highlights.length ? highlights : ['Design-led delivery', 'Integrated consultancy', 'Client-ready project documentation'],
    source: 'supabase'
  };
}

async function fetchSupabaseProjects(){
  if (!isSupabaseReady() || !window.supabase) return [];
  const cfg = window.SIEN_SUPABASE_CONFIG;
  const client = window.supabase.createClient(cfg.url, cfg.anonKey);
  const { data, error } = await client
    .from('projects')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('SIEN portfolio sync failed:', error.message);
    if (portfolioSyncNote) portfolioSyncNote.textContent = `Portfolio sync failed: ${error.message}. Static portfolio is still visible.`;
    return [];
  }
  return (data || []).map(normalizeDbProject);
}

function mergeProjects(dynamicProjects, staticProjects){
  const map = new Map();
  staticProjects.forEach(p => map.set(p.slug || slugify(p.title), p));
  dynamicProjects.slice().reverse().forEach(p => map.set(p.slug || slugify(p.title), p));
  const dynamicSlugs = new Set(dynamicProjects.map(p => p.slug));
  const merged = [...dynamicProjects, ...staticProjects.filter(p => !dynamicSlugs.has(p.slug))];
  return merged.length ? merged : staticProjects;
}

function renderSectorBars(){
  if (!sectorBars) return;
  sectorBars.innerHTML = '';
  const sectorCounts = PROJECTS.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});
  const values = Object.values(sectorCounts);
  const max = values.length ? Math.max(...values) : 1;
  Object.entries(sectorCounts).sort((a,b)=>b[1]-a[1]).forEach(([name, val]) => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `<span>${name}</span><div class="bar-track"><div class="bar-fill" style="--w:${(val/max)*100}%"></div></div><strong>${val}</strong>`;
    sectorBars.appendChild(row);
  });
  const barObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) $$('.bar-fill', sectorBars).forEach(f => f.style.width = f.style.getPropertyValue('--w')); });
  }, { threshold: .35 });
  barObserver.observe(sectorBars);
}

function renderFilters(){
  if (!filterBar) return;
  const categories = ['All', ...new Set(PROJECTS.map(p => p.category).filter(Boolean))];
  if (!categories.includes(activeFilter)) activeFilter = 'All';
  filterBar.innerHTML = categories.map(cat => `<button class="${cat === activeFilter ? 'active' : ''}" data-filter="${cat}">${cat}</button>`).join('');
  $$('#filterBar button').forEach(btn => btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    renderFilters();
    renderProjects();
  }));
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function renderProjects(){
  if (!projectGrid) return;
  const list = activeFilter === 'All' ? PROJECTS : PROJECTS.filter(p => p.category === activeFilter);
  projectGrid.innerHTML = list.map((p, i) => `
    <article class="project-card reveal visible" data-slug="${escapeHtml(p.slug)}" style="transition-delay:${Math.min(i*35,240)}ms">
      <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" />
      <div class="project-content">
        <div class="tag-row"><span>${escapeHtml(p.status)}</span><span>${escapeHtml(p.location)}</span><span>${escapeHtml(p.category)}</span></div>
        <h3>${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.description)}</p>
      </div>
    </article>`).join('');
  $$('.project-card').forEach(card => card.addEventListener('click', () => openProject(card.dataset.slug)));
}

const modal = $('#projectModal');
const modalBody = $('#modalBody');
function openProject(slug){
  const p = PROJECTS.find(x => x.slug === slug); if (!p || !modal || !modalBody) return;
  const gallery = Array.isArray(p.gallery) && p.gallery.length ? p.gallery : [p.image];
  modalBody.innerHTML = `
    <div class="modal-visual">
      <img src="${escapeHtml(gallery[0])}" alt="${escapeHtml(p.title)}" id="modalMainImage" />
    </div>
    <div class="modal-copy">
      <div class="modal-meta"><span>${escapeHtml(p.category)}</span><span>${escapeHtml(p.status)}</span><span>${escapeHtml(p.location)}</span>${p.size ? `<span>${escapeHtml(p.size)}</span>` : ''}</div>
      <h2>${escapeHtml(p.title)}</h2>
      <p>${escapeHtml(p.description)}</p>
      <h3>Scope of work</h3>
      <p>${escapeHtml(p.scope || 'Full multidisciplinary delivery support from design concept to project coordination.')}</p>
      <ul class="highlight-list">${(p.highlights || []).map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul>
      <div class="modal-gallery">${gallery.map((g,idx)=>`<img src="${escapeHtml(g)}" alt="${escapeHtml(p.title)} image ${idx+1}" class="${idx===0?'active':''}" />`).join('')}</div>
    </div>`;
  modal.showModal();
  const main = $('#modalMainImage');
  $$('.modal-gallery img', modalBody).forEach(img => img.addEventListener('click', () => {
    main.src = img.src;
    $$('.modal-gallery img', modalBody).forEach(i=>i.classList.remove('active'));
    img.classList.add('active');
  }));
}

$$('.modal-close').forEach(btn => btn.addEventListener('click', () => btn.closest('dialog').close()));
if (modal) modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });

const lightbox = $('#lightbox');
const lightboxImage = $('#lightboxImage');
$$('.certificate').forEach(btn => btn.addEventListener('click', () => {
  if (!lightbox || !lightboxImage) return;
  lightboxImage.src = btn.dataset.cert;
  lightbox.showModal();
}));
if (lightbox) lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.close(); });

async function initPortfolio(){
  const staticProjects = fallbackProjects();
  const dynamicProjects = await fetchSupabaseProjects();
  PROJECTS = mergeProjects(dynamicProjects, staticProjects);
  renderSectorBars();
  renderFilters();
  renderProjects();
  if (portfolioSyncNote) {
    if (!isSupabaseReady()) portfolioSyncNote.textContent = 'Admin sync is ready. Add Supabase credentials in supabase-config.js to activate live uploads.';
    else if (dynamicProjects.length) portfolioSyncNote.textContent = `${dynamicProjects.length} admin-published project${dynamicProjects.length === 1 ? '' : 's'} synced live into the portfolio.`;
    else portfolioSyncNote.textContent = 'Supabase connected. Publish projects from the admin portal and they will appear here automatically.';
  }
}

initPortfolio();


// Leadership team card micro-interactions
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReducedMotion) {
  $$('[data-tilt]').forEach(card => {
    card.addEventListener('pointermove', e => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rx = (0.5 - py) * 8;
      const ry = (px - 0.5) * 10;
      card.style.transform = `translateY(-10px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
    });
  });
}
