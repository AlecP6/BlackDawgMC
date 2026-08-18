/* ===================================
   BLACKDAWG MC — ESPACE MEMBRES
   API-driven (Vercel + Neon)
   =================================== */

const AUTH_KEY = 'bdmc_token';

/* ---- UTILITAIRES ---- */
const $   = id => document.getElementById(id);
const fmt = n  => '$' + Number(n).toLocaleString('fr-FR');
const today = () => new Date().toISOString().slice(0, 10);
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/* ---- API ---- */
function getToken() { return sessionStorage.getItem(AUTH_KEY); }

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api/' + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

function showError(msg) {
  console.error(msg);
  alert('Erreur : ' + msg);
}

/* ====================================
   AUTH
   ==================================== */
let currentUser = null;

function checkAuth() {
  const token = getToken();
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp * 1000 > Date.now()) {
        currentUser = payload;
        showDashboard();
        return;
      }
    } catch {}
  }
  sessionStorage.removeItem(AUTH_KEY);
  $('loginScreen').classList.remove('hidden');
  $('dashboard').classList.add('hidden');
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;
  try {
    const data = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!data.ok) {
      const err = await data.json();
      $('loginError').textContent = err.error || 'Erreur de connexion';
      return;
    }
    const { token, user } = await data.json();
    sessionStorage.setItem(AUTH_KEY, token);
    currentUser = user;
    $('loginError').textContent = '';
    showDashboard();
  } catch {
    $('loginError').textContent = 'Impossible de contacter le serveur.';
  }
});

$('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem(AUTH_KEY);
  currentUser = null;
  location.reload();
});

function showDashboard() {
  $('loginScreen').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
  initDashboard();
}

/* ====================================
   DASHBOARD
   ==================================== */
function initDashboard() {
  $('sidebarUser').innerHTML = `
    <div class="user-info">
      <div class="user-avatar">${escHtml(currentUser.username.charAt(0).toUpperCase())}</div>
      <div>
        <span class="user-name">${escHtml(currentUser.username)}</span>
        <span class="user-role">${currentUser.role === 'admin' ? 'Admin' : 'Membre'}</span>
      </div>
    </div>`;

  if (currentUser.role === 'admin') {
    document.querySelector('.nav-item-admin').classList.remove('hidden');
  }

  const SECTION_LABELS = {
    compta: 'Comptabilité', armurerie: 'Armurerie',
    prix: 'Infos Prix', annuaire: 'Annuaire',
    groupes: 'Infos Groupes', stock: 'Stock', membres: 'Membres'
  };

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.dataset.section;
      $('section' + key.charAt(0).toUpperCase() + key.slice(1)).classList.add('active');
      const titleEl = $('mobileSectionTitle');
      if (titleEl) titleEl.textContent = SECTION_LABELS[key] || '';
      closeSidebar();
    });
  });

  $('searchCompta').addEventListener('input', renderCompta);
  $('searchArmes').addEventListener('input', renderArms);
  $('searchPrix').addEventListener('input', renderPrices);
  $('searchAnnuaire').addEventListener('input', renderContacts);
  $('searchGroupes').addEventListener('input', renderGroups);
  $('searchStock').addEventListener('input', renderStock);

  ['filter','wfilter','pfilter','cfilter','gfilter'].forEach(key => {
    document.querySelectorAll(`[data-${key}]`).forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`[data-${key}]`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (key === 'filter')  renderCompta();
        if (key === 'wfilter') renderArms();
        if (key === 'pfilter') renderPrices();
        if (key === 'cfilter') renderContacts();
        if (key === 'gfilter') renderGroups();
      });
    });
  });

  loadAll();
}

async function loadAll() {
  await Promise.all([renderCompta(), renderArms(), renderPrices(), renderContacts(), renderGroups(), renderStock(), renderMembers()]);
}

/* ====================================
   MODALS
   ==================================== */
function openModal(id)  { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

document.querySelectorAll('.modal-close, .btn-cancel').forEach(btn => {
  btn.addEventListener('click', () => { if (btn.dataset.modal) closeModal(btn.dataset.modal); });
});
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape')
    ['modalTransaction','modalWeapon','modalPrice','modalContact','modalGroup','modalStock','modalMember','modalConfirm']
    .forEach(id => { if (!$(id).classList.contains('hidden')) closeModal(id); });
});

/* ====================================
   COMPTABILITÉ
   ==================================== */
let _comptaData = [];

async function renderCompta() {
  try { _comptaData = await api('GET', 'transactions'); } catch (e) { showError(e.message); return; }
  let data = [..._comptaData];

  const income  = data.filter(t => t.type === 'income').reduce((s,t)  => s + Number(t.amount), 0);
  const expense = data.filter(t => t.type === 'expense').reduce((s,t) => s + Number(t.amount), 0);
  $('totalIncome').textContent  = fmt(income);
  $('totalExpense').textContent = fmt(expense);
  $('totalBalance').textContent = fmt(income - expense);

  const filter = document.querySelector('[data-filter].active')?.dataset.filter || 'all';
  const search = $('searchCompta').value.toLowerCase().trim();
  if (filter !== 'all') data = data.filter(t => t.type === filter);
  if (search) data = data.filter(t => t.description.toLowerCase().includes(search) || t.category.toLowerCase().includes(search));

  const tbody = $('comptaBody');
  tbody.innerHTML = '';
  if (!data.length) { $('comptaEmpty').classList.remove('hidden'); return; }
  $('comptaEmpty').classList.add('hidden');

  data.forEach(t => {
    const canEdit = currentUser.role === 'admin' || t.created_by === currentUser.username;
    const d = new Date(t.date);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Date">${d.toLocaleDateString('fr-FR')}</td>
      <td data-label="Description">${escHtml(t.description)}</td>
      <td data-label="Catégorie">${escHtml(t.category)}</td>
      <td data-label="Type"><span class="badge badge-${t.type}">${t.type === 'income' ? 'Entrée' : 'Sortie'}</span></td>
      <td data-label="Montant" class="${t.type === 'income' ? 'amount-positive' : 'amount-negative'}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}</td>
      <td data-label="Ajouté par"><span class="author-tag">${escHtml(t.created_by||'—')}</span>${t.updated_by?`<span class="edit-tag"> ✎ ${escHtml(t.updated_by)}</span>`:''}</td>
      <td data-label="Actions"><div class="action-btns">${canEdit
        ? `<button class="btn-edit" onclick="editTransaction('${t.id}')">Modifier</button><button class="btn-del" onclick="confirmDelete('transaction','${t.id}','${escHtml(t.description)}')">Suppr.</button>`
        : '<span style="color:var(--gray-light);font-size:0.75rem">—</span>'}</div></td>`;
    tbody.appendChild(tr);
  });
}

$('btnAddTransaction').addEventListener('click', () => {
  $('modalTransactionTitle').textContent = 'Ajouter une transaction';
  $('formTransaction').reset();
  $('transactionId').value = '';
  $('transDate').value = today();
  openModal('modalTransaction');
});

window.editTransaction = id => {
  const t = _comptaData.find(x => x.id === id);
  if (!t) return;
  $('modalTransactionTitle').textContent = 'Modifier la transaction';
  $('transactionId').value = t.id;
  $('transDate').value     = t.date.slice(0,10);
  $('transType').value     = t.type;
  $('transDesc').value     = t.description;
  $('transCategory').value = t.category;
  $('transAmount').value   = t.amount;
  openModal('modalTransaction');
};

$('formTransaction').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('transactionId').value;
  const body = { id, date: $('transDate').value, type: $('transType').value, description: $('transDesc').value.trim(), category: $('transCategory').value, amount: parseFloat($('transAmount').value) };
  try {
    if (id) await api('PUT', 'transactions', body);
    else    await api('POST', 'transactions', body);
    closeModal('modalTransaction');
    renderCompta();
  } catch(e) { showError(e.message); }
});

/* ====================================
   ARMURERIE
   ==================================== */
let _armsData = [];

const WEAPON_CATEGORIES = {
  'Pistolet SNS':'Pistolet','Pistolet céramique':'Pistolet','Pistolet de combat':'Pistolet',
  'Pistolet 8x3m':'Pistolet','Pistolet Lourd':'Pistolet','Pistolet MK2':'Pistolet',
  'Pistolet Cal.50':'Pistolet','Pistolet automatique Tec9':'Pistolet',
  'Skorpion (mini-smg)':'Mitrailleuse','Uzi (micro-smg)':'Mitrailleuse',
  'PDW de Combat':'Mitrailleuse','TMP':'Mitrailleuse',"SMG d'assaut":'Mitrailleuse',
  'AK-U':'Fusil','Gusenberg':'Fusil',
  'Canon scié':'Fusil à pompe','Double canon':'Fusil à pompe',
  'Revolver MK2':'Pistolet','SNS MK2':'Pistolet','Assault MK2':'Fusil',
  'Pompe MK2':'Fusil à pompe','Revolver Navy':'Pistolet',
};

$('weaponName').addEventListener('change', () => {
  const cat = WEAPON_CATEGORIES[$('weaponName').value];
  if (cat) $('weaponCategory').value = cat;
});

async function renderArms() {
  try { _armsData = await api('GET', 'weapons'); } catch (e) { showError(e.message); return; }
  let data = [..._armsData];

  $('totalWeapons').textContent   = data.reduce((s,w) => s + w.qty, 0);
  $('weaponsInStock').textContent = data.filter(w => w.status === 'Disponible').reduce((s,w) => s + w.qty, 0);

  const filter = document.querySelector('[data-wfilter].active')?.dataset.wfilter || 'all';
  const search = $('searchArmes').value.toLowerCase().trim();
  if (filter !== 'all') data = data.filter(w => w.category === filter);
  if (search) data = data.filter(w => w.name.toLowerCase().includes(search) || w.category.toLowerCase().includes(search));
  data.sort((a,b) => a.name.localeCompare(b.name));

  const tbody = $('armsBody');
  tbody.innerHTML = '';
  if (!data.length) { $('armsEmpty').classList.remove('hidden'); return; }
  $('armsEmpty').classList.add('hidden');

  data.forEach(w => {
    const canEdit = currentUser.role === 'admin' || w.created_by === currentUser.username;
    const statusBadge = { 'Disponible':'badge-ok','Assignée':'badge-assign','Hors service':'badge-broken' }[w.status] || 'badge-ok';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Arme"><strong>${escHtml(w.name)}</strong></td>
      <td data-label="Catégorie">${escHtml(w.category)}</td>
      <td data-label="Calibre">${escHtml(w.caliber||'—')}</td>
      <td data-label="Quantité" class="${w.qty<=2?'qty-low':'qty-ok'}">${w.qty}${w.qty<=2?' ⚠':''}</td>
      <td data-label="État"><span class="badge ${statusBadge}">${escHtml(w.status)}</span></td>
      <td data-label="Notes" style="font-size:0.8rem;color:var(--white-dim)">${escHtml(w.notes||'—')}</td>
      <td data-label="Ajouté par"><span class="author-tag">${escHtml(w.created_by||'—')}</span>${w.updated_by?`<span class="edit-tag"> ✎ ${escHtml(w.updated_by)}</span>`:''}</td>
      <td data-label="Actions"><div class="action-btns">${canEdit
        ? `<button class="btn-edit" onclick="editWeapon('${w.id}')">Modifier</button><button class="btn-del" onclick="confirmDelete('weapon','${w.id}','${escHtml(w.name)}')">Suppr.</button>`
        : '<span style="color:var(--gray-light);font-size:0.75rem">—</span>'}</div></td>`;
    tbody.appendChild(tr);
  });
}

$('btnAddWeapon').addEventListener('click', () => {
  $('modalWeaponTitle').textContent = 'Ajouter une arme';
  $('formWeapon').reset();
  $('weaponId').value = '';
  openModal('modalWeapon');
});

window.editWeapon = id => {
  const w = _armsData.find(x => x.id === id);
  if (!w) return;
  $('modalWeaponTitle').textContent = 'Modifier l\'arme';
  $('weaponId').value       = w.id;
  $('weaponName').value     = w.name;
  $('weaponCategory').value = w.category;
  $('weaponCaliber').value  = w.caliber || '';
  $('weaponQty').value      = w.qty;
  $('weaponStatus').value   = w.status;
  $('weaponNotes').value    = w.notes || '';
  openModal('modalWeapon');
};

$('formWeapon').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('weaponId').value;
  const body = { id, name: $('weaponName').value, category: $('weaponCategory').value, caliber: $('weaponCaliber').value.trim()||null, qty: parseInt($('weaponQty').value,10), status: $('weaponStatus').value, notes: $('weaponNotes').value.trim()||null };
  try {
    if (id) await api('PUT', 'weapons', body);
    else    await api('POST', 'weapons', body);
    closeModal('modalWeapon');
    renderArms();
  } catch(e) { showError(e.message); }
});

/* ====================================
   INFOS PRIX
   ==================================== */
let _pricesData = [];

const PRICE_CAT_COLORS = { 'Armes':'badge-broken','Business':'badge-assign','Véhicules':'badge-ok','Services':'badge-ok','Autre':'' };

function togglePriceNameField() {
  const isWeapon = $('priceCategory').value === 'Armes';
  $('priceNameGroup').classList.toggle('hidden', isWeapon);
  $('priceNameWeaponGroup').classList.toggle('hidden', !isWeapon);
  $('priceName').required       = !isWeapon;
  $('priceNameWeapon').required = isWeapon;
}

$('priceCategory').addEventListener('change', togglePriceNameField);

function getPriceName() {
  return $('priceCategory').value === 'Armes' ? $('priceNameWeapon').value : $('priceName').value.trim();
}
function setPriceName(category, name) {
  if (category === 'Armes') $('priceNameWeapon').value = name;
  else $('priceName').value = name;
}

async function renderPrices() {
  try { _pricesData = await api('GET', 'prices'); } catch (e) { showError(e.message); return; }
  let data = [..._pricesData];

  const filter = document.querySelector('[data-pfilter].active')?.dataset.pfilter || 'all';
  const search = $('searchPrix').value.toLowerCase().trim();
  if (filter !== 'all') data = data.filter(p => p.category === filter);
  if (search) data = data.filter(p => p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search));
  data.sort((a,b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const tbody = $('pricesBody');
  tbody.innerHTML = '';
  if (!data.length) { $('pricesEmpty').classList.remove('hidden'); return; }
  $('pricesEmpty').classList.add('hidden');

  data.forEach(p => {
    const canEdit = currentUser.role === 'admin' || p.created_by === currentUser.username;
    const margin = (p.price_sell && p.price_buy) ? Number(p.price_sell) - Number(p.price_buy) : null;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Nom"><strong>${escHtml(p.name)}</strong></td>
      <td data-label="Catégorie"><span class="badge ${PRICE_CAT_COLORS[p.category]||''}">${escHtml(p.category)}</span></td>
      <td data-label="Prix achat" style="color:var(--red)">${p.price_buy ? fmt(p.price_buy) : '—'}</td>
      <td data-label="Prix revente" style="color:var(--green)">${p.price_sell ? fmt(p.price_sell) : '—'}${margin!==null?`<span class="margin-tag">+${fmt(margin)}</span>`:''}</td>
      <td data-label="Unité" style="font-size:0.8rem;color:var(--white-dim)">${escHtml(p.unit)}</td>
      <td data-label="Notes" style="font-size:0.8rem;color:var(--white-dim)">${escHtml(p.notes||'—')}</td>
      <td data-label="Ajouté par"><span class="author-tag">${escHtml(p.created_by||'—')}</span>${p.updated_by?`<span class="edit-tag"> ✎ ${escHtml(p.updated_by)}</span>`:''}</td>
      <td data-label="Actions"><div class="action-btns">${canEdit
        ? `<button class="btn-edit" onclick="editPrice('${p.id}')">Modifier</button><button class="btn-del" onclick="confirmDelete('price','${p.id}','${escHtml(p.name)}')">Suppr.</button>`
        : '<span style="color:var(--gray-light);font-size:0.75rem">—</span>'}</div></td>`;
    tbody.appendChild(tr);
  });
}

$('btnAddPrice').addEventListener('click', () => {
  $('modalPriceTitle').textContent = 'Ajouter un prix';
  $('formPrice').reset();
  $('priceId').value = '';
  togglePriceNameField();
  openModal('modalPrice');
});

window.editPrice = id => {
  const p = _pricesData.find(x => x.id === id);
  if (!p) return;
  $('modalPriceTitle').textContent = 'Modifier le prix';
  $('priceId').value       = p.id;
  $('priceCategory').value = p.category;
  togglePriceNameField();
  setPriceName(p.category, p.name);
  $('priceBuy').value      = p.price_buy || '';
  $('priceSell').value     = p.price_sell || '';
  $('priceUnit').value     = p.unit;
  $('priceNotes').value    = p.notes || '';
  openModal('modalPrice');
};

$('formPrice').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('priceId').value;
  const body = { id, name: getPriceName(), category: $('priceCategory').value, price_buy: $('priceBuy').value ? parseFloat($('priceBuy').value) : null, price_sell: $('priceSell').value ? parseFloat($('priceSell').value) : null, unit: $('priceUnit').value, notes: $('priceNotes').value.trim()||null };
  try {
    if (id) await api('PUT', 'prices', body);
    else    await api('POST', 'prices', body);
    closeModal('modalPrice');
    renderPrices();
  } catch(e) { showError(e.message); }
});

/* ====================================
   ANNUAIRE
   ==================================== */
let _contactsData = [];

const GRADE_BADGE = { 'Haut gradé':'badge-broken','Gradé':'badge-assign','Membre':'badge-ok','Prospect':'' };

async function renderContacts() {
  try { _contactsData = await api('GET', 'contacts'); } catch (e) { showError(e.message); return; }
  let data = [..._contactsData];

  const filter = document.querySelector('[data-cfilter].active')?.dataset.cfilter || 'all';
  const search = $('searchAnnuaire').value.toLowerCase().trim();
  if (filter !== 'all') data = data.filter(c => c.grade === filter);
  if (search) data = data.filter(c => c.name.toLowerCase().includes(search) || c.phone.toLowerCase().includes(search));
  data.sort((a,b) => a.name.localeCompare(b.name));

  const tbody = $('contactsBody');
  tbody.innerHTML = '';
  if (!data.length) { $('contactsEmpty').classList.remove('hidden'); return; }
  $('contactsEmpty').classList.add('hidden');

  data.forEach(c => {
    const canEdit = currentUser.role === 'admin' || c.created_by === currentUser.username;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Nom"><strong>${escHtml(c.name)}</strong></td>
      <td data-label="Grade"><span class="badge ${GRADE_BADGE[c.grade]||''}">${escHtml(c.grade)}</span></td>
      <td data-label="Numéro"><span class="phone-number">${escHtml(c.phone)}</span></td>
      <td data-label="Notes" style="font-size:0.8rem;color:var(--white-dim)">${escHtml(c.notes||'—')}</td>
      <td data-label="Ajouté par"><span class="author-tag">${escHtml(c.created_by||'—')}</span>${c.updated_by?`<span class="edit-tag"> ✎ ${escHtml(c.updated_by)}</span>`:''}</td>
      <td data-label="Actions"><div class="action-btns">${canEdit
        ? `<button class="btn-edit" onclick="editContact('${c.id}')">Modifier</button><button class="btn-del" onclick="confirmDelete('contact','${c.id}','${escHtml(c.name)}')">Suppr.</button>`
        : '<span style="color:var(--gray-light);font-size:0.75rem">—</span>'}</div></td>`;
    tbody.appendChild(tr);
  });
}

$('btnAddContact').addEventListener('click', () => {
  $('modalContactTitle').textContent = 'Ajouter un contact';
  $('formContact').reset();
  $('contactId').value = '';
  openModal('modalContact');
});

window.editContact = id => {
  const c = _contactsData.find(x => x.id === id);
  if (!c) return;
  $('modalContactTitle').textContent = 'Modifier le contact';
  $('contactId').value    = c.id;
  $('contactName').value  = c.name;
  $('contactGrade').value = c.grade;
  $('contactPhone').value = c.phone;
  $('contactNotes').value = c.notes || '';
  openModal('modalContact');
};

$('formContact').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('contactId').value;
  const body = { id, name: $('contactName').value.trim(), grade: $('contactGrade').value, phone: $('contactPhone').value.trim(), notes: $('contactNotes').value.trim()||null };
  try {
    if (id) await api('PUT', 'contacts', body);
    else    await api('POST', 'contacts', body);
    closeModal('modalContact');
    renderContacts();
  } catch(e) { showError(e.message); }
});

/* ====================================
   INFOS GROUPES
   ==================================== */
let _groupsData = [];

const RELATION_BADGE = { 'Allié':'badge-ok','Neutre':'badge-assign','Ennemi':'badge-broken' };
const RELATION_COLOR = { 'Allié':'var(--green)','Neutre':'var(--yellow)','Ennemi':'var(--red)' };

async function renderGroups() {
  try { _groupsData = await api('GET', 'groups'); } catch (e) { showError(e.message); return; }
  let data = [..._groupsData];

  const filter = document.querySelector('[data-gfilter].active')?.dataset.gfilter || 'all';
  const search = $('searchGroupes').value.toLowerCase().trim();
  if (filter !== 'all') data = data.filter(g => g.relation === filter);
  if (search) data = data.filter(g => g.name.toLowerCase().includes(search) || (g.notes||'').toLowerCase().includes(search));
  data.sort((a,b) => a.name.localeCompare(b.name));

  const container = $('groupsCards');
  container.innerHTML = '';
  if (!data.length) { $('groupsEmpty').classList.remove('hidden'); return; }
  $('groupsEmpty').classList.add('hidden');

  data.forEach(g => {
    const canEdit = currentUser.role === 'admin' || g.created_by === currentUser.username;
    const phones     = Array.isArray(g.phones)     ? g.phones     : JSON.parse(g.phones     || '[]');
    const businesses = Array.isArray(g.businesses) ? g.businesses : JSON.parse(g.businesses || '[]');
    const card = document.createElement('div');
    card.className = 'group-card';
    card.style.borderLeftColor = RELATION_COLOR[g.relation] || 'var(--gray)';

    const phonesHtml = phones.length
      ? phones.map(p => `<div class="group-detail-item"><span class="group-detail-label">${escHtml(p.label||'—')}</span><span class="phone-number">${escHtml(p.number)}</span></div>`).join('')
      : '<span style="color:var(--gray-light);font-size:0.82rem">Aucun numéro</span>';

    const bizHtml = businesses.length
      ? businesses.map(b => `<span class="biz-tag">${escHtml(b)}</span>`).join('')
      : '<span style="color:var(--gray-light);font-size:0.82rem">Aucun business lié</span>';

    card.innerHTML = `
      <div class="group-card-header">
        <div><h3 class="group-name">${escHtml(g.name)}</h3><span class="badge ${RELATION_BADGE[g.relation]||''}">${escHtml(g.relation)}</span></div>
        ${canEdit ? `<div class="action-btns"><button class="btn-edit" onclick="editGroup('${g.id}')">Modifier</button><button class="btn-del" onclick="confirmDelete('group','${g.id}','${escHtml(g.name)}')">Suppr.</button></div>` : ''}
      </div>
      <div class="group-card-body">
        <div class="group-section"><span class="group-section-title">Téléphones</span><div class="group-phones">${phonesHtml}</div></div>
        <div class="group-section"><span class="group-section-title">Business liés</span><div class="group-biz">${bizHtml}</div></div>
        ${g.notes ? `<div class="group-section"><span class="group-section-title">Notes</span><p class="group-notes">${escHtml(g.notes)}</p></div>` : ''}
      </div>
      <div class="group-card-footer"><span class="author-tag">Ajouté par ${escHtml(g.created_by||'—')}</span>${g.updated_by?`<span class="edit-tag"> ✎ ${escHtml(g.updated_by)}</span>`:''}</div>`;
    container.appendChild(card);
  });
}

function addPhoneRow(label='', number='') {
  const div = document.createElement('div');
  div.className = 'phone-entry';
  div.innerHTML = `<input type="text" class="phone-input" placeholder="Nom du contact" value="${escHtml(label)}" /><input type="text" class="phone-number-input" placeholder="Numéro" value="${escHtml(number)}" /><button type="button" class="btn-remove-phone">✕</button>`;
  div.querySelector('.btn-remove-phone').addEventListener('click', () => div.remove());
  $('phonesList').appendChild(div);
}

function addBusinessRow(val='') {
  const div = document.createElement('div');
  div.className = 'business-entry';
  div.innerHTML = `<input type="text" class="business-input" placeholder="Ex: Garage Southside..." value="${escHtml(val)}" /><button type="button" class="btn-remove-business">✕</button>`;
  div.querySelector('.btn-remove-business').addEventListener('click', () => div.remove());
  $('businessList').appendChild(div);
}

$('phonesList').querySelector('.btn-remove-phone').addEventListener('click', function() { this.closest('.phone-entry').remove(); });
$('businessList').querySelector('.btn-remove-business').addEventListener('click', function() { this.closest('.business-entry').remove(); });
$('btnAddPhone').addEventListener('click', () => addPhoneRow());
$('btnAddBusiness').addEventListener('click', () => addBusinessRow());

$('btnAddGroup').addEventListener('click', () => {
  $('modalGroupTitle').textContent = 'Ajouter un groupe';
  $('formGroup').reset();
  $('groupId').value = '';
  $('phonesList').innerHTML = '';
  $('businessList').innerHTML = '';
  addPhoneRow();
  addBusinessRow();
  openModal('modalGroup');
});

window.editGroup = id => {
  const g = _groupsData.find(x => x.id === id);
  if (!g) return;
  const phones     = Array.isArray(g.phones)     ? g.phones     : JSON.parse(g.phones     || '[]');
  const businesses = Array.isArray(g.businesses) ? g.businesses : JSON.parse(g.businesses || '[]');
  $('modalGroupTitle').textContent = 'Modifier le groupe';
  $('groupId').value       = g.id;
  $('groupName').value     = g.name;
  $('groupRelation').value = g.relation;
  $('groupNotes').value    = g.notes || '';
  $('phonesList').innerHTML = '';
  $('businessList').innerHTML = '';
  (phones.length ? phones : [{ label:'', number:'' }]).forEach(p => addPhoneRow(p.label, p.number));
  (businesses.length ? businesses : ['']).forEach(b => addBusinessRow(b));
  openModal('modalGroup');
};

$('formGroup').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('groupId').value;
  const phones = [...$('phonesList').querySelectorAll('.phone-entry')].map(r => ({ label: r.querySelector('.phone-input').value.trim(), number: r.querySelector('.phone-number-input').value.trim() })).filter(p => p.number);
  const businesses = [...$('businessList').querySelectorAll('.business-input')].map(i => i.value.trim()).filter(Boolean);
  const body = { id, name: $('groupName').value.trim(), relation: $('groupRelation').value, phones, businesses, notes: $('groupNotes').value.trim()||null };
  try {
    if (id) await api('PUT', 'groups', body);
    else    await api('POST', 'groups', body);
    closeModal('modalGroup');
    renderGroups();
  } catch(e) { showError(e.message); }
});

/* ====================================
   STOCK BUSINESS
   ==================================== */
let _stockData = [];

async function renderStock() {
  try { _stockData = await api('GET', 'stock'); } catch (e) { showError(e.message); return; }
  let data = [..._stockData];

  const search = $('searchStock').value.toLowerCase().trim();
  if (search) data = data.filter(s => s.name.toLowerCase().includes(search) || (s.business||'').toLowerCase().includes(search));
  data.sort((a,b) => (a.business||'').localeCompare(b.business||'') || a.name.localeCompare(b.name));

  const container = $('stockCards');
  container.innerHTML = '';
  if (!data.length) { $('stockEmpty').classList.remove('hidden'); return; }
  $('stockEmpty').classList.add('hidden');

  data.forEach(s => {
    const canEdit = currentUser.role === 'admin' || s.created_by === currentUser.username;
    const card = document.createElement('div');
    card.className = 'stock-card';
    card.innerHTML = `
      <div class="stock-card-header">
        <div class="stock-name">${escHtml(s.name)}</div>
        ${s.business ? `<span class="biz-tag">${escHtml(s.business)}</span>` : ''}
      </div>
      <div class="stock-card-body">
        <div class="stock-qty">
          <span class="stock-qty-value">${s.qty}</span>
          <span class="stock-qty-unit">${escHtml(s.unit)}</span>
        </div>
        ${s.notes ? `<div class="stock-notes">${escHtml(s.notes)}</div>` : ''}
      </div>
      <div class="stock-card-footer">
        <span class="author-tag">${escHtml(s.created_by||'—')}</span>${s.updated_by?`<span class="edit-tag"> ✎ ${escHtml(s.updated_by)}</span>`:''}
        <div class="action-btns">${canEdit
          ? `<button class="btn-edit" onclick="editStock('${s.id}')">Modifier</button><button class="btn-del" onclick="confirmDelete('stock','${s.id}','${escHtml(s.name)}')">Suppr.</button>`
          : ''}</div>
      </div>`;
    container.appendChild(card);
  });
}

$('btnAddStock').addEventListener('click', () => {
  $('modalStockTitle').textContent = 'Ajouter un article';
  $('formStock').reset();
  $('stockId').value = '';
  openModal('modalStock');
});

window.editStock = id => {
  const s = _stockData.find(x => x.id === id);
  if (!s) return;
  $('modalStockTitle').textContent = 'Modifier l\'article';
  $('stockId').value       = s.id;
  $('stockName').value     = s.name;
  $('stockBusiness').value = s.business || '';
  $('stockQty').value      = s.qty;
  $('stockUnit').value     = s.unit;
  $('stockNotes').value    = s.notes || '';
  openModal('modalStock');
};

$('formStock').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('stockId').value;
  const body = {
    id,
    name:     $('stockName').value.trim(),
    business: $('stockBusiness').value.trim() || null,
    qty:      parseInt($('stockQty').value, 10),
    unit:     $('stockUnit').value,
    notes:    $('stockNotes').value.trim() || null,
  };
  try {
    if (id) await api('PUT', 'stock', body);
    else    await api('POST', 'stock', body);
    closeModal('modalStock');
    renderStock();
  } catch(e) { showError(e.message); }
});

/* ====================================
   GESTION MEMBRES
   ==================================== */
let _usersData = [];

async function renderMembers() {
  if (currentUser?.role !== 'admin') return;
  try { _usersData = await api('GET', 'users'); } catch (e) { return; }
  const tbody = $('membersBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  _usersData.forEach(u => {
    const isSelf = u.id === currentUser.id;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Identifiant"><span class="author-tag">${escHtml(u.username)}</span></td>
      <td data-label="Rôle"><span class="badge ${u.role==='admin'?'badge-assign':'badge-ok'}">${u.role==='admin'?'Admin':'Membre'}</span></td>
      <td data-label="Actions"><div class="action-btns">
        <button class="btn-edit" onclick="editMember('${u.id}')">Modifier</button>
        ${!isSelf ? `<button class="btn-del" onclick="confirmDelete('member','${u.id}','${escHtml(u.username)}')">Suppr.</button>` : ''}
      </div></td>`;
    tbody.appendChild(tr);
  });
}

$('btnAddMember').addEventListener('click', () => {
  $('modalMemberTitle').textContent = 'Ajouter un membre';
  $('formMember').reset();
  $('memberId').value = '';
  openModal('modalMember');
});

window.editMember = id => {
  const u = _usersData.find(x => x.id === id);
  if (!u) return;
  $('modalMemberTitle').textContent = 'Modifier le membre';
  $('memberId').value       = u.id;
  $('memberUsername').value = u.username;
  $('memberPassword').value = '';
  $('memberRole').value     = u.role;
  openModal('modalMember');
};

$('formMember').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('memberId').value;
  const body = { id, username: $('memberUsername').value.trim(), password: $('memberPassword').value, role: $('memberRole').value };
  try {
    if (id) await api('PUT', 'users', body);
    else    await api('POST', 'users', body);
    closeModal('modalMember');
    renderMembers();
  } catch(e) { showError(e.message); }
});

/* ====================================
   SUPPRESSION
   ==================================== */
let _deleteTarget = null;

window.confirmDelete = (type, id, label) => {
  $('confirmText').textContent = `Supprimer "${label}" ? Cette action est irréversible.`;
  _deleteTarget = { type, id };
  openModal('modalConfirm');
};

$('confirmDeleteBtn').addEventListener('click', async () => {
  if (!_deleteTarget) return;
  const { type, id } = _deleteTarget;
  const routes = { transaction:'transactions', weapon:'weapons', price:'prices', contact:'contacts', group:'groups', stock:'stock', member:'users' };
  const renders = { transaction:renderCompta, weapon:renderArms, price:renderPrices, contact:renderContacts, group:renderGroups, stock:renderStock, member:renderMembers };
  try {
    await api('DELETE', `${routes[type]}?id=${id}`, null);
    renders[type]?.();
  } catch(e) { showError(e.message); }
  _deleteTarget = null;
  closeModal('modalConfirm');
});

/* ====================================
   MOBILE SIDEBAR TOGGLE
   ==================================== */
function openSidebar() {
  const sidebar  = $('sidebar');
  const backdrop = $('sidebarBackdrop');
  const toggle   = $('sidebarToggle');
  if (sidebar)  sidebar.classList.add('open');
  if (backdrop) backdrop.classList.add('visible');
  if (toggle)   toggle.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  const sidebar  = $('sidebar');
  const backdrop = $('sidebarBackdrop');
  const toggle   = $('sidebarToggle');
  if (sidebar)  sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('visible');
  if (toggle)   toggle.classList.remove('open');
  document.body.style.overflow = '';
}

const sidebarToggle  = $('sidebarToggle');
const sidebarBackdrop = $('sidebarBackdrop');
if (sidebarToggle)   sidebarToggle.addEventListener('click', openSidebar);
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

/* ====================================
   INIT
   ==================================== */
checkAuth();
