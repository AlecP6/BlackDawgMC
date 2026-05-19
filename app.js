// ===== CONFIG =====
const API = '/api';

// ===== ANIMATIONS UTILITAIRES =====

// Applique une animation d'apparition décalée (stagger) sur toutes les cartes d'une grille.
// Chaque carte repart de opacity:0 puis se réanime avec un délai de 55ms × son index,
// produisant un effet visuel d'entrée en cascade plutôt qu'un apparition simultanée.
function applyStagger(grid) {
  const cards = grid.querySelectorAll('.weapon-card, .group-card, .mission-card');
  cards.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.animation = 'none';
    // Double requestAnimationFrame nécessaire pour forcer le navigateur à "voir"
    // le reset de l'animation avant de relancer la nouvelle.
    requestAnimationFrame(() => {
      el.style.animation = `fadeIn 0.35s cubic-bezier(.22,1,.36,1) ${i * 55}ms forwards`;
    });
  });
}

// Anime un compteur numérique de 0 vers `target` sur 650ms avec un easing "ease-out cubic"
// (décélération progressive). Le `formatter` optionnel est appliqué à chaque frame
// pour afficher des unités (ex : formatAmount pour les montants $).
// Si la valeur n'est pas numérique, elle est affichée directement sans animation.
function animateCounter(el, target, formatter = null) {
  const num = parseFloat(String(target).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) { el.textContent = formatter ? formatter(target) : target; return; }
  const start = performance.now();
  const duration = 650;
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    // Formule ease-out cubique : rapide au début, ralentit vers la fin
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(eased * num);
    el.textContent = formatter ? formatter(current) : current;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = formatter ? formatter(num) : num;
  };
  requestAnimationFrame(step);
}

// ===== LOADING SCREEN =====
function hideLoadingScreen() {
  const el = document.getElementById('loadingScreen');
  if (el) el.classList.add('hidden');
}

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'success') {
  const icons = { success: '✓', error: '✕', warning: '⚠' };
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '•'}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('show')); });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

// ===== CONFIRM MODAL =====
let _confirmCallback = null;
function confirmAction(message, callback, confirmLabel = 'Supprimer') {
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('btnConfirmYes').textContent = confirmLabel;
  _confirmCallback = callback;
  openModal('confirmModal');
}
document.getElementById('btnConfirmYes')?.addEventListener('click', () => {
  closeModal('confirmModal');
  if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
});
document.getElementById('btnConfirmNo')?.addEventListener('click', () => {
  closeModal('confirmModal');
  _confirmCallback = null;
});
document.getElementById('confirmModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('confirmModal')) {
    closeModal('confirmModal');
    _confirmCallback = null;
  }
});

// ===== AUTH =====
// currentUser : objet utilisateur courant (id, rp_name, is_admin…) ; null si déconnecté.
// authToken   : JWT renvoyé par le serveur, inclus dans chaque requête API.
let currentUser = null;
let authToken   = null;

// Relit la session depuis sessionStorage (persist le temps de l'onglet, pas au-delà).
// Retourne { token, user } ou null si aucune session n'est enregistrée.
function getStoredSession() {
  const token = sessionStorage.getItem('cc_token');
  const user  = sessionStorage.getItem('cc_user');
  if (token && user) return { token, user: JSON.parse(user) };
  return null;
}

// Persiste le token JWT et les données utilisateur pour la durée de l'onglet.
function storeSession(token, user) {
  sessionStorage.setItem('cc_token', token);
  sessionStorage.setItem('cc_user', JSON.stringify(user));
}

// Supprime la session stockée (appel lors de la déconnexion).
function clearStoredSession() {
  sessionStorage.removeItem('cc_token');
  sessionStorage.removeItem('cc_user');
}

function showAuthOverlay() {
  document.getElementById('authOverlay').classList.remove('hidden');
}

function hideAuthOverlay() {
  document.getElementById('authOverlay').classList.add('hidden');
}

function showPanel(id) {
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setAuthError(panelId, msg) {
  const errorId = panelId === 'panelLogin' ? 'loginError' : 'registerError';
  document.getElementById(errorId).textContent = msg;
}

function clearAuthErrors() {
  document.getElementById('loginError').textContent    = '';
  document.getElementById('registerError').textContent = '';
}

// Switch panels
document.getElementById('goRegister')?.addEventListener('click', (e) => {
  e.preventDefault();
  clearAuthErrors();
  showPanel('panelRegister');
});

document.getElementById('goLogin')?.addEventListener('click', (e) => {
  e.preventDefault();
  clearAuthErrors();
  showPanel('panelLogin');
});

// Register
document.getElementById('btnRegister')?.addEventListener('click', async () => {
  const username    = document.getElementById('regId').value.trim();
  const rp_name     = document.getElementById('regRpName').value.trim();
  const password    = document.getElementById('regPwd').value;
  const confirm     = document.getElementById('regPwdConfirm').value;
  const invite_code = document.getElementById('regInviteCode').value.trim();

  if (!username)    return setAuthError('panelRegister', 'L\'identifiant est requis.');
  if (!rp_name)     return setAuthError('panelRegister', 'Le nom RP est requis.');
  if (!password)    return setAuthError('panelRegister', 'Le mot de passe est requis.');
  if (password.length < 4) return setAuthError('panelRegister', 'Mot de passe trop court (min. 4 caractères).');
  if (password !== confirm) return setAuthError('panelRegister', 'Les mots de passe ne correspondent pas.');
  if (!invite_code) return setAuthError('panelRegister', 'Le code d\'invitation est requis.');

  setAuthLoading('btnRegister', true);
  try {
    const res  = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, rp_name, password, invite_code }),
    });
    const data = await res.json();
    if (!res.ok) return setAuthError('panelRegister', data.error || 'Erreur.');
    loginUser(data.token, data.user);
  } catch {
    setAuthError('panelRegister', 'Impossible de contacter le serveur.');
  } finally {
    setAuthLoading('btnRegister', false);
  }
});

// Login
document.getElementById('btnLogin')?.addEventListener('click', async () => {
  const username = document.getElementById('loginId').value.trim();
  const password = document.getElementById('loginPwd').value;

  if (!username) return setAuthError('panelLogin', 'L\'identifiant est requis.');
  if (!password) return setAuthError('panelLogin', 'Le mot de passe est requis.');

  setAuthLoading('btnLogin', true);
  try {
    const res  = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) return setAuthError('panelLogin', data.error || 'Erreur.');
    loginUser(data.token, data.user);
  } catch {
    setAuthError('panelLogin', 'Impossible de contacter le serveur.');
  } finally {
    setAuthLoading('btnLogin', false);
  }
});

function setAuthLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading
    ? 'Chargement...'
    : btnId === 'btnLogin' ? 'Se connecter' : 'Créer le compte';
}

// Enter key on auth inputs
document.querySelectorAll('.auth-input').forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const panel = input.closest('.auth-panel');
    if (panel?.id === 'panelLogin')    document.getElementById('btnLogin').click();
    if (panel?.id === 'panelRegister') document.getElementById('btnRegister').click();
  });
});

// Met à jour les variables globales de session, persiste et initialise l'interface.
function loginUser(token, user) {
  currentUser = user;
  authToken   = token;
  storeSession(token, user);
  hideAuthOverlay();
  onUserLoggedIn(user);
}

// Appelé après une connexion réussie : met à jour l'avatar, le nom RP en topbar,
// affiche le lien Admin uniquement aux admins et charge le dashboard.
function onUserLoggedIn(user) {
  // Génère les initiales à partir du nom RP (ex : "Jean Dupont" → "JD")
  const initials = user.rp_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('userAvatar').textContent = initials;
  document.getElementById('userRpName').textContent = user.rp_name;
  const adminNav = document.getElementById('adminNavItem');
  if (adminNav) adminNav.style.display = user.is_admin ? '' : 'none';
  switchSection('comptabilite');
}

// Logout
document.getElementById('btnLogout')?.addEventListener('click', () => {
  clearStoredSession();
  currentUser = null;
  authToken   = null;
  document.getElementById('loginId').value = '';
  document.getElementById('loginPwd').value = '';
  clearAuthErrors();
  showPanel('panelLogin');
  showAuthOverlay();
});

// ===== NAVIGATION =====
const navItems    = document.querySelectorAll('.nav-item');
const sections    = document.querySelectorAll('.section');
const topbarTitle = document.getElementById('topbarTitle');

// Correspondance entre l'id de section et le titre affiché dans la topbar.
const sectionTitles = {
  'comptabilite': 'Comptabilité',
  'armement': 'Armement',
  'groupes': 'Groupes',
  'resume-tables': 'Résumé Tables',
  'missions': 'Missions',
  'admin': 'Administration',
};

// Restore session on load
const saved = getStoredSession();
if (saved) {
  loginUser(saved.token, saved.user);
  setTimeout(hideLoadingScreen, 600);
} else {
  showAuthOverlay();
  hideLoadingScreen();
}

// Active la section cible (affichage CSS), met à jour la navigation,
// ferme la sidebar sur mobile et déclenche le chargement des données spécifiques à la section.
function switchSection(targetId) {
  sections.forEach(s => s.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));
  const targetSection = document.getElementById('section-' + targetId);
  const targetNav     = document.querySelector(`[data-section="${targetId}"]`);
  if (targetSection) targetSection.classList.add('active');
  if (targetNav)     targetNav.classList.add('active');
  if (topbarTitle)   topbarTitle.textContent = sectionTitles[targetId] || targetId;
  if (window.innerWidth <= 768) closeSidebar();

  // Chargement des données par section — chaque section charge ses données à la demande (lazy loading)
  if (currentUser) {
    if (targetId === 'comptabilite') {
      refreshComptabilite();
    }
    if (targetId === 'armement') {
      fetchWeapons();
      fetchMembers();
    }
    if (targetId === 'groupes') {
      fetchGroups();
    }
    if (targetId === 'resume-tables') {
      fetchSummaries();
      initSummaryDate();
    }
    if (targetId === 'missions') {
      fetchMissions();
    }
    if (targetId === 'admin') {
      fetchAdminInviteCode();
      fetchAdminUsers();
      fetchLogs();
      fetchTransactions();
    }
  }
}

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.getAttribute('data-section');
    if (section) switchSection(section);
  });
});

// ===== MOBILE MENU =====
const menuToggle     = document.getElementById('menuToggle');
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay?.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay?.classList.remove('visible');
  document.body.style.overflow = '';
}

menuToggle?.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});

sidebarOverlay?.addEventListener('click', closeSidebar);

// ===== COMPTABILITÉ =====
let transactions = [];
let activeFilter = 'all';
let txSort = { col: 'date', dir: 'desc' };
let txPage = 1;
const TX_PER_PAGE = 10;

// Construit les en-têtes HTTP communs pour toutes les requêtes authentifiées :
// Content-Type JSON + JWT Bearer token issu de la session en cours.
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };
}

// Récupère toutes les transactions depuis l'API, met à jour le cache local,
// puis déclenche : rendu du tableau, calcul des stats et tableau des cotisations.
async function fetchTransactions() {
  try {
    const res  = await fetch(`${API}/transactions`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    transactions = data;
    renderTransactions();
    updateStats();
    renderCotisationsTable();
  } catch {
    console.error('Erreur chargement transactions.');
  }
}

// Formate un nombre en devise : préfixe "$" avec séparateur de milliers (locale fr-CA utilise l'espace).
// Ex : 1500 → "$1 500"
function formatAmount(n) {
  return '$' + Number(n).toLocaleString('fr-CA', { maximumFractionDigits: 0 });
}

// Formate une date ISO en "JJ/MM/AAAA HH:MM" lisible.
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Recalcule les totaux entrées/sorties/solde à partir du cache `transactions`
// et anime les cartes de statistiques. Le solde apparaît en rouge si négatif.
function updateStats() {
  const total_in  = transactions.filter(t => t.type === 'entree').reduce((s, t) => s + Number(t.amount), 0);
  const total_out = transactions.filter(t => t.type === 'sortie').reduce((s, t) => s + Number(t.amount), 0);
  const balance   = total_in - total_out;

  animateCounter(document.getElementById('statBalance'), balance, formatAmount);
  animateCounter(document.getElementById('statIncome'),  total_in,  formatAmount);
  animateCounter(document.getElementById('statExpense'), total_out, formatAmount);
  animateCounter(document.getElementById('statCount'),   transactions.length);

  document.getElementById('statBalance').style.color = balance < 0 ? '#e05c5c' : 'var(--accent)';

  // Topbar balance
  const topbarEl = document.getElementById('topbarBalance');
  if (topbarEl) {
    topbarEl.textContent = formatAmount(balance);
    topbarEl.style.color = balance < 0 ? '#e05c5c' : 'var(--accent)';
  }
}

function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  let html = `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>←</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    } else if (Math.abs(i - currentPage) === 2) {
      html += `<span class="page-dots">…</span>`;
    }
  }
  html += `<button class="page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>→</button>`;
  container.innerHTML = html;
  container.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => onPageChange(Number(btn.dataset.page)));
  });
}

function renderTransactions() {
  const tbody    = document.getElementById('transactionsList');
  const emptyRow = document.getElementById('emptyTransactions');

  let filtered = activeFilter === 'all'
    ? transactions
    : transactions.filter(t => t.type === activeFilter);

  // Tri
  filtered = [...filtered].sort((a, b) => {
    let va, vb;
    switch (txSort.col) {
      case 'type':   va = a.type;   vb = b.type;   break;
      case 'member': va = a.member; vb = b.member; break;
      case 'motif':  va = a.motif;  vb = b.motif;  break;
      case 'amount': va = Number(a.amount); vb = Number(b.amount); break;
      default:       va = new Date(a.created_at); vb = new Date(b.created_at); break;
    }
    if (va < vb) return txSort.dir === 'asc' ? -1 : 1;
    if (va > vb) return txSort.dir === 'asc' ? 1  : -1;
    return 0;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / TX_PER_PAGE));
  if (txPage > totalPages) txPage = totalPages;
  const start     = (txPage - 1) * TX_PER_PAGE;
  const paginated = filtered.slice(start, start + TX_PER_PAGE);

  Array.from(tbody.querySelectorAll('tr.data-row')).forEach(r => r.remove());

  if (filtered.length === 0) {
    emptyRow.style.display = '';
    renderPagination('txPagination', 1, 1, () => {});
    return;
  }
  emptyRow.style.display = 'none';

  renderPagination('txPagination', txPage, totalPages, (p) => { txPage = p; renderTransactions(); });

  paginated.forEach(t => {
    const tr = document.createElement('tr');
    tr.className  = 'data-row';
    tr.dataset.id = t.id;

    const badgeClass  = t.type === 'entree' ? 'badge-entree' : 'badge-sortie';
    const badgeLabel  = t.type === 'entree' ? '↑ Entrée' : '↓ Sortie';
    const amountClass = t.type === 'entree' ? 'amount-entree' : 'amount-sortie';
    const sign        = t.type === 'entree' ? '+' : '−';

    tr.innerHTML = `
      <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
      <td>${escapeHtml(t.member)}</td>
      <td class="td-motif" title="${escapeHtml(t.motif)}">${escapeHtml(t.motif)}</td>
      <td class="${amountClass}">${sign}${formatAmount(t.amount)}</td>
      <td class="td-date">${formatDate(t.created_at)}</td>
      <td><button class="btn-delete" data-id="${t.id}" title="Supprimer">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// Échappe les caractères HTML spéciaux pour prévenir les injections XSS
// lors de l'insertion de contenu utilisateur directement dans le DOM via innerHTML.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function refreshComptabilite() {
  fetchTransactions();
}

// Type toggle
document.getElementById('btnEntree')?.addEventListener('click', () => {
  document.getElementById('transactionType').value = 'entree';
  document.getElementById('btnEntree').classList.add('active');
  document.getElementById('btnSortie').classList.remove('active');
});

document.getElementById('btnSortie')?.addEventListener('click', () => {
  document.getElementById('transactionType').value = 'sortie';
  document.getElementById('btnSortie').classList.add('active');
  document.getElementById('btnEntree').classList.remove('active');
});

// Add transaction
document.getElementById('btnAddTransaction')?.addEventListener('click', async () => {
  if (!currentUser) return;

  const amountRaw = document.getElementById('transactionAmount').value;
  const motif     = document.getElementById('transactionMotif').value.trim();
  const type      = document.getElementById('transactionType').value;

  if (!amountRaw || parseInt(amountRaw) <= 0) return flashInput('transactionAmount', 'Montant invalide');
  if (!motif) return flashInput('transactionMotif', 'Motif requis');

  const btn = document.getElementById('btnAddTransaction');
  btn.disabled    = true;
  btn.textContent = 'Ajout...';

  try {
    const res  = await fetch(`${API}/transactions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ type, motif, amount: parseInt(amountRaw) }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Erreur.', 'error'); return; }

    transactions.unshift(data);
    updateStats();
    renderTransactions();
    showToast('Transaction ajoutée avec succès.');

    document.getElementById('transactionAmount').value = '';
    document.getElementById('transactionMotif').value  = '';
  } catch {
    showToast('Impossible de contacter le serveur.', 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Ajouter la transaction';
  }
});

// Signale visuellement une erreur de saisie : bordure rouge + message dans le placeholder.
// Se réinitialise automatiquement après 2 secondes.
function flashInput(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = '#e05c5c';
  el.placeholder = msg;
  el.focus();
  setTimeout(() => {
    el.style.borderColor = '';
    el.placeholder = id === 'transactionAmount' ? '0' : 'Raison de la transaction...';
  }, 2000);
}

// Delete transaction
document.getElementById('transactionsList')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-delete');
  if (!btn) return;
  const id = Number(btn.dataset.id);

  try {
    const res = await fetch(`${API}/transactions/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) return;
    transactions = transactions.filter(t => t.id !== id);
    updateStats();
    renderTransactions();
    showToast('Transaction supprimée.');
  } catch {
    showToast('Impossible de contacter le serveur.', 'error');
  }
});

// Filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    txPage = 1;
    renderTransactions();
  });
});

// Sort headers
document.querySelectorAll('.sortable-th').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.sort;
    if (txSort.col === col) {
      txSort.dir = txSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      txSort.col = col;
      txSort.dir = col === 'date' ? 'desc' : 'asc';
    }
    txPage = 1;
    document.querySelectorAll('.sortable-th').forEach(h => {
      h.classList.remove('active-sort');
      h.querySelector('.sort-arrow').textContent = '↕';
    });
    th.classList.add('active-sort');
    th.querySelector('.sort-arrow').textContent = txSort.dir === 'asc' ? '↑' : '↓';
    renderTransactions();
  });
});

// ===== ARMEMENT =====
let weapons      = [];
let members      = [];
let weaponFilter = 'all';
let weaponSearch = '';
let wpPage = 1;
const WP_PER_PAGE = 12;
let assignTarget = null;    // id de l'arme dont la modale d'attribution est ouverte

const CATEGORY_ICONS = {
  'Arme à feu': '',
  'Arme blanche': '',
};

async function fetchWeapons() {
  try {
    const res  = await fetch(`${API}/weapons`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    weapons = data;
    renderWeapons();
    updateWeaponStats();
  } catch { console.error('Erreur chargement armes.'); }
}

// Récupère la liste des membres et repeuple les deux selects d'attribution
// (armes et véhicules) qui dépendent de cette liste.
async function fetchMembers() {
  try {
    const res  = await fetch(`${API}/members`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    members = data;
    populateAssignSelect();
    populateVehicleAssignSelect();
  } catch { console.error('Erreur chargement membres.'); }
}

function updateWeaponStats() {
  const total    = weapons.length;
  const assigned = weapons.filter(w => w.assigned_to).length;
  animateCounter(document.getElementById('weaponStatTotal'),    total);
  animateCounter(document.getElementById('weaponStatAssigned'), assigned);
  animateCounter(document.getElementById('weaponStatFree'),     total - assigned);
}

// Retourne les armes correspondant au filtre actif (disponible / attribuée / toutes)
// ET à la recherche textuelle (portant sur le nom ou la catégorie).
function getFilteredWeapons() {
  return weapons.filter(w => {
    if (weaponFilter === 'free'     && w.assigned_to)  return false;
    if (weaponFilter === 'assigned' && !w.assigned_to) return false;
    if (weaponSearch) {
      const q = weaponSearch.toLowerCase();
      if (!w.name.toLowerCase().includes(q) && !w.category.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function renderWeapons() {
  const grid  = document.getElementById('weaponsGrid');
  const empty = document.getElementById('weaponsEmpty');
  const list  = getFilteredWeapons();

  Array.from(grid.querySelectorAll('.weapon-card')).forEach(c => c.remove());

  if (list.length === 0) {
    empty.style.display = '';
    renderPagination('wpPagination', 1, 1, () => {});
    return;
  }
  empty.style.display = 'none';

  const totalPages = Math.max(1, Math.ceil(list.length / WP_PER_PAGE));
  if (wpPage > totalPages) wpPage = totalPages;
  const start    = (wpPage - 1) * WP_PER_PAGE;
  const paginated = list.slice(start, start + WP_PER_PAGE);
  renderPagination('wpPagination', wpPage, totalPages, (p) => { wpPage = p; renderWeapons(); });

  paginated.forEach(w => {
    const card = document.createElement('div');
    card.className  = `weapon-card ${w.assigned_to ? 'is-assigned' : 'is-free'}`;
    card.dataset.id = w.id;

    const icon     = CATEGORY_ICONS[w.category] || '';
    // Génère les initiales du propriétaire depuis son nom RP (ex : "Jean Dupont" → "JD").
    const initials = w.assigned_to_name
      ? w.assigned_to_name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2)
      : '—';

    card.innerHTML = `
      <div class="weapon-card-top">
        <div class="weapon-card-category">${icon} ${escapeHtml(w.category)}</div>
        <div class="weapon-card-name">${escapeHtml(w.name)}</div>
        ${w.notes ? `<div class="weapon-card-notes">${escapeHtml(w.notes)}</div>` : ''}
      </div>
      <div class="weapon-card-divider"></div>
      <div class="weapon-card-bottom">
        <div class="weapon-assignee">
          <div class="weapon-assignee-avatar ${w.assigned_to ? 'assigned' : 'free'}">${initials}</div>
          <span class="weapon-assignee-name ${w.assigned_to ? 'assigned' : 'free'}">
            ${w.assigned_to ? escapeHtml(w.assigned_to_name) : 'Disponible'}
          </span>
        </div>
        <div class="weapon-card-actions">
          <button class="btn-assign" data-id="${w.id}" title="Attribuer">
            ${w.assigned_to ? '↩ Modifier' : '+ Attribuer'}
          </button>
          <button class="btn-delete" data-weapon-id="${w.id}" title="Supprimer">✕</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
  applyStagger(grid);
}

// Réinitialise et repeuple le <select> d'attribution des armes avec la liste
// des membres actuels. L'option vide permet de retirer une attribution existante.
function populateAssignSelect() {
  const sel = document.getElementById('assignSelect');
  sel.innerHTML = '<option value="">-- Aucun (retirer l\'attribution) --</option>';
  members.forEach(m => {
    const opt = document.createElement('option');
    opt.value       = m.id;
    opt.textContent = m.rp_name;
    sel.appendChild(opt);
  });
}

// Add weapon
document.getElementById('btnAddWeapon')?.addEventListener('click', async () => {
  if (!currentUser) return;
  const name     = document.getElementById('weaponName').value.trim();
  const category = document.getElementById('weaponCategory').value;
  const notes    = document.getElementById('weaponNotes').value.trim();

  if (!name)     return flashInput('weaponName',     'Nom requis');
  if (!category) return flashInput('weaponCategory', 'Catégorie requise');

  const btn = document.getElementById('btnAddWeapon');
  btn.disabled = true; btn.textContent = 'Ajout...';

  try {
    const res  = await fetch(`${API}/weapons`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({ name, category, notes }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Erreur.', 'error'); return; }
    weapons.unshift(data);
    updateWeaponStats();
    renderWeapons();
    document.getElementById('weaponName').value  = '';
    document.getElementById('weaponCategory').value = '';
    document.getElementById('weaponNotes').value = '';
  } catch { showToast('Impossible de contacter le serveur.', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Ajouter l\'arme'; }
});

// Click on grid (assign / delete)
document.getElementById('weaponsGrid')?.addEventListener('click', (e) => {
  const assignBtn = e.target.closest('.btn-assign');
  const deleteBtn = e.target.closest('[data-weapon-id]');

  if (assignBtn) {
    assignTarget = Number(assignBtn.dataset.id);
    const weapon = weapons.find(w => w.id === assignTarget);
    document.getElementById('assignModalTitle').textContent = `Attribuer : ${weapon?.name}`;
    populateAssignSelect();
    const sel = document.getElementById('assignSelect');
    sel.value = weapon?.assigned_to ?? '';
    openModal('assignModal');
  }

  if (deleteBtn && !assignBtn) {
    const id = Number(deleteBtn.dataset.weaponId);
    deleteWeapon(id);
  }
});

async function deleteWeapon(id) {
  try {
    const res = await fetch(`${API}/weapons/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) return;
    weapons = weapons.filter(w => w.id !== id);
    updateWeaponStats();
    renderWeapons();
  } catch { showToast('Impossible de contacter le serveur.', 'error'); }
}

// Modal confirm assign
document.getElementById('btnConfirmAssign')?.addEventListener('click', async () => {
  if (assignTarget === null) return;
  const userId = document.getElementById('assignSelect').value || null;
  const parsed = userId ? parseInt(userId) : null;

  try {
    const res  = await fetch(`${API}/weapons/${assignTarget}/assign`, {
      method:  'PATCH',
      headers: authHeaders(),
      body:    JSON.stringify({ user_id: parsed }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Erreur.', 'error'); return; }
    const idx = weapons.findIndex(w => w.id === assignTarget);
    if (idx !== -1) weapons[idx] = data;
    updateWeaponStats();
    renderWeapons();
    closeModal('assignModal');
  } catch { showToast('Impossible de contacter le serveur.', 'error'); }
});

// Ouvre/ferme une modale par son id. closeModal remet également assignTarget à null
// pour éviter qu'une ancienne cible ne soit réutilisée par erreur.
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  assignTarget = null;
}

document.getElementById('assignModalClose')?.addEventListener('click',  () => closeModal('assignModal'));
document.getElementById('assignModalCancel')?.addEventListener('click', () => closeModal('assignModal'));
document.getElementById('assignModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('assignModal')) closeModal('assignModal');
});

// Filters
document.querySelectorAll('[data-wfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-wfilter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    weaponFilter = btn.dataset.wfilter;
    wpPage = 1;
    renderWeapons();
  });
});

// Search
document.getElementById('weaponSearch')?.addEventListener('input', (e) => {
  weaponSearch = e.target.value.trim();
  wpPage = 1;
  renderWeapons();
});

// ===== GROUPES =====
// Cache local des groupes et terme de recherche en cours.
let groups      = [];
let groupSearch = '';

// Récupère les groupes, les affiche dans la grille et met à jour les polygones sur la carte
async function fetchGroups() {
  try {
    const res  = await fetch(`${API}/groups`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    groups = data;
    renderGroups();
  } catch { console.error('Erreur chargement groupes.'); }
}

function getFilteredGroups() {
  if (!groupSearch) return groups;
  const q = groupSearch.toLowerCase();
  return groups.filter(g =>
    g.name.toLowerCase().includes(q) ||
    (g.residence  && g.residence.toLowerCase().includes(q)) ||
    (g.territory  && g.territory.toLowerCase().includes(q))
  );
}

function renderGroups() {
  const grid  = document.getElementById('groupsGrid');
  const empty = document.getElementById('groupsEmpty');
  const list  = getFilteredGroups();

  Array.from(grid.querySelectorAll('.group-card')).forEach(c => c.remove());

  if (list.length === 0) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  list.forEach(g => {
    const card = document.createElement('div');
    card.className  = 'group-card';
    card.dataset.id = g.id;

    const updatedDate = new Date(g.updated_at).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    const field = (label, value) => `
      <div class="group-field">
        <span class="group-field-label">${label}</span>
        <span class="group-field-value ${value ? '' : 'empty'}">${escapeHtml(value || 'Non renseigné')}</span>
      </div>`;

    card.innerHTML = `
      <div class="group-card-header">
        <span class="group-card-name">
          ${escapeHtml(g.name)}
        </span>
        <div class="group-card-actions">
          <button class="btn-edit"  data-group-edit="${g.id}">Modifier</button>
          <button class="btn-delete" data-group-del="${g.id}">✕</button>
        </div>
      </div>
      <div class="group-card-body">
        ${field(' Lieu de résidence',   g.residence)}
        ${field(' Territoire contrôlé', g.territory)}
        ${field(' Téléphone',           g.phone)}
        ${field(' Business possédé',    g.business)}
        ${field(' Entreprise possédée', g.company)}
      </div>
      ${g.notes ? `
      <div class="group-card-notes">
        <span class="group-field-label"> Informations complémentaires</span>
        <div class="group-notes-text">${escapeHtml(g.notes)}</div>
      </div>` : ''}
      <div class="group-card-footer">
        <span>Créé par ${escapeHtml(g.created_by_name || '—')}</span>
        <span>Mis à jour le ${updatedDate} par ${escapeHtml(g.updated_by_name || '—')}</span>
      </div>
    `;
    grid.appendChild(card);
  });
  applyStagger(grid);
}

// Ouvrir modal en mode ajout
document.getElementById('btnOpenAddGroup')?.addEventListener('click', () => {
  openGroupModal(null);
});

// Ouvrir modal en mode édition ou supprimer via la grille
document.getElementById('groupsGrid')?.addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-group-edit]');
  const delBtn  = e.target.closest('[data-group-del]');

  if (editBtn) {
    const id    = Number(editBtn.dataset.groupEdit);
    const group = groups.find(g => g.id === id);
    if (group) openGroupModal(group);
  }
  if (delBtn) {
    const id = Number(delBtn.dataset.groupDel);
    deleteGroup(id);
  }
});


function openGroupModal(group) {
  document.getElementById('groupModalTitle').textContent = group ? `Modifier : ${group.name}` : 'Nouveau groupe';
  document.getElementById('groupEditId').value    = group?.id ?? '';
  document.getElementById('groupName').value      = group?.name      ?? '';
  document.getElementById('groupResidence').value = group?.residence ?? '';
  document.getElementById('groupTerritory').value = group?.territory ?? '';
  document.getElementById('groupPhone').value     = group?.phone     ?? '';
  document.getElementById('groupBusiness').value  = group?.business  ?? '';
  document.getElementById('groupCompany').value   = group?.company   ?? '';
  document.getElementById('groupNotes').value     = group?.notes     ?? '';

  const color = group?.color || '#ffffff';
  document.getElementById('groupColor').value           = color;
  document.getElementById('groupColorLabel').textContent = color;

  document.getElementById('groupError').textContent = '';
  openModal('groupModal');
}

document.getElementById('groupColor')?.addEventListener('input', (e) => {
  document.getElementById('groupColorLabel').textContent = e.target.value;
});

// Sauvegarder groupe
document.getElementById('btnSaveGroup')?.addEventListener('click', async () => {
  const id        = document.getElementById('groupEditId').value;
  const name      = document.getElementById('groupName').value.trim();
  const residence = document.getElementById('groupResidence').value.trim();
  const territory = document.getElementById('groupTerritory').value.trim();
  const phone     = document.getElementById('groupPhone').value.trim();
  const business  = document.getElementById('groupBusiness').value.trim();
  const company   = document.getElementById('groupCompany').value.trim();
  const notes     = document.getElementById('groupNotes').value.trim();

  if (!name) {
    document.getElementById('groupError').textContent = 'Le nom du groupe est requis.';
    return;
  }

  const color    = document.getElementById('groupColor').value;
  const body = { name, residence, territory, phone, business, company, notes, color };
  const isEdit  = id !== '';
  const url     = isEdit ? `${API}/groups/${id}` : `${API}/groups`;
  const method  = isEdit ? 'PUT' : 'POST';

  const btn = document.getElementById('btnSaveGroup');
  btn.disabled = true; btn.textContent = 'Enregistrement...';

  try {
    const res  = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('groupError').textContent = data.error || 'Erreur.';
      return;
    }
    if (isEdit) {
      const idx = groups.findIndex(g => g.id === Number(id));
      if (idx !== -1) groups[idx] = data;
    } else {
      groups.unshift(data);
    }
    renderGroups();
    closeModal('groupModal');
    showToast(isEdit ? 'Groupe modifié.' : 'Groupe créé.');
  } catch {
    document.getElementById('groupError').textContent = 'Impossible de contacter le serveur.';
  } finally {
    btn.disabled = false; btn.textContent = 'Enregistrer';
  }
});

async function deleteGroup(id) {
  try {
    const res = await fetch(`${API}/groups/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) return;
    groups = groups.filter(g => g.id !== id);
    renderGroups();
  } catch { showToast('Impossible de contacter le serveur.', 'error'); }
}

// Fermeture modal groupe
document.getElementById('groupModalClose')?.addEventListener('click',  () => closeModal('groupModal'));
document.getElementById('groupModalCancel')?.addEventListener('click', () => closeModal('groupModal'));
document.getElementById('groupModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('groupModal')) closeModal('groupModal');
});

// Recherche groupes
document.getElementById('groupSearch')?.addEventListener('input', (e) => {
  groupSearch = e.target.value.trim();
  renderGroups();
});

// ===== RÉSUMÉ TABLES =====
// Cache local des résumés (comptes-rendus de réunion) et terme de recherche.
let summaries     = [];
let summarySearch = '';

async function fetchSummaries() {
  try {
    const res  = await fetch(`${API}/summaries`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    summaries = data;
    renderSummaries();
  } catch { console.error('Erreur chargement résumés.'); }
}

// Convertit une date ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:...) en format lisible JJ/MM/AAAA.
// On tronque à 10 caractères pour ignorer l'heure si elle est présente.
function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const clean = dateStr.substring(0, 10);
  const [y, m, d] = clean.split('-');
  return `${d}/${m}/${y}`;
}

function formatPostedDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getFilteredSummaries() {
  if (!summarySearch) return summaries;
  const q = summarySearch.toLowerCase();
  return summaries.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.content.toLowerCase().includes(q)
  );
}

function renderSummaries() {
  const timeline = document.getElementById('summaryTimeline');
  const empty    = document.getElementById('summaryEmpty');
  const list     = getFilteredSummaries();

  Array.from(timeline.querySelectorAll('.timeline-entry')).forEach(e => e.remove());

  if (list.length === 0) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  list.forEach(s => {
    const entry = document.createElement('div');
    entry.className  = 'timeline-entry';
    entry.dataset.id = s.id;

    const isOwn = currentUser && s.created_by === currentUser.id;

    entry.innerHTML = `
      <div class="timeline-block">
        <div class="timeline-block-header">
          <div class="timeline-block-meta">
            <span class="timeline-block-title">${escapeHtml(s.title)}</span>
            <span class="timeline-block-date"> ${formatEventDate(s.event_date)}</span>
          </div>
          ${isOwn ? `
          <div class="timeline-block-actions">
            <button class="btn-edit" data-summary-edit="${s.id}">Modifier</button>
            <button class="btn-delete" data-summary-del="${s.id}">✕</button>
          </div>` : ''}
        </div>
        <div class="timeline-block-content">${escapeHtml(s.content)}</div>
        <div class="timeline-block-footer">
          <span>Publié par <strong>${escapeHtml(s.created_by_name || '—')}</strong></span>
          <span>Le ${formatPostedDate(s.created_at)}</span>
        </div>
      </div>
    `;
    timeline.appendChild(entry);
  });
}

// Pré-remplit la date du formulaire de résumé avec la date du jour (format YYYY-MM-DD)
// uniquement si le champ est encore vide (évite d'écraser une saisie en cours).
function initSummaryDate() {
  const input = document.getElementById('summaryDate');
  if (input && !input.value) {
    input.value = new Date().toISOString().split('T')[0];
  }
}

// Ajouter un résumé
document.getElementById('btnAddSummary')?.addEventListener('click', async () => {
  if (!currentUser) return;

  const title      = document.getElementById('summaryTitle').value.trim();
  const event_date = document.getElementById('summaryDate').value;
  const content    = document.getElementById('summaryContent').value.trim();
  const errorEl    = document.getElementById('summaryFormError');

  errorEl.textContent = '';
  if (!title)      { errorEl.textContent = 'Le titre est requis.';   return; }
  if (!event_date) { errorEl.textContent = 'La date est requise.';   return; }
  if (!content)    { errorEl.textContent = 'Le contenu est requis.'; return; }

  const btn = document.getElementById('btnAddSummary');
  btn.disabled = true; btn.textContent = 'Publication...';

  try {
    const res  = await fetch(`${API}/summaries`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title, content, event_date }),
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'Erreur.'; return; }

    summaries.unshift(data);
    summaries.sort((a, b) => b.event_date.localeCompare(a.event_date));
    renderSummaries();

    document.getElementById('summaryTitle').value   = '';
    document.getElementById('summaryContent').value = '';
    document.getElementById('summaryDate').value    = new Date().toISOString().split('T')[0];
  } catch {
    errorEl.textContent = 'Impossible de contacter le serveur.';
  } finally {
    btn.disabled = false; btn.textContent = 'Publier le résumé';
  }
});

// Clic sur la timeline (edit / delete)
document.getElementById('summaryTimeline')?.addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-summary-edit]');
  const delBtn  = e.target.closest('[data-summary-del]');

  if (editBtn) {
    const id      = Number(editBtn.dataset.summaryEdit);
    const summary = summaries.find(s => s.id === id);
    if (summary) openSummaryModal(summary);
  }
  if (delBtn) {
    const id = Number(delBtn.dataset.summaryDel);
    deleteSummary(id);
  }
});

function openSummaryModal(s) {
  document.getElementById('summaryEditId').value      = s.id;
  document.getElementById('summaryEditTitle').value   = s.title;
  document.getElementById('summaryEditDate').value    = s.event_date;
  document.getElementById('summaryEditContent').value = s.content;
  document.getElementById('summaryEditError').textContent = '';
  openModal('summaryModal');
}

document.getElementById('btnSaveSummary')?.addEventListener('click', async () => {
  const id         = document.getElementById('summaryEditId').value;
  const title      = document.getElementById('summaryEditTitle').value.trim();
  const event_date = document.getElementById('summaryEditDate').value;
  const content    = document.getElementById('summaryEditContent').value.trim();
  const errorEl    = document.getElementById('summaryEditError');

  errorEl.textContent = '';
  if (!title)      { errorEl.textContent = 'Le titre est requis.';   return; }
  if (!event_date) { errorEl.textContent = 'La date est requise.';   return; }
  if (!content)    { errorEl.textContent = 'Le contenu est requis.'; return; }

  const btn = document.getElementById('btnSaveSummary');
  btn.disabled = true; btn.textContent = 'Enregistrement...';

  try {
    const res  = await fetch(`${API}/summaries/${id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ title, content, event_date }),
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'Erreur.'; return; }

    const idx = summaries.findIndex(s => s.id === Number(id));
    if (idx !== -1) summaries[idx] = data;
    summaries.sort((a, b) => b.event_date.localeCompare(a.event_date));
    renderSummaries();
    closeModal('summaryModal');
  } catch {
    errorEl.textContent = 'Impossible de contacter le serveur.';
  } finally {
    btn.disabled = false; btn.textContent = 'Enregistrer';
  }
});

async function deleteSummary(id) {
  try {
    const res = await fetch(`${API}/summaries/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) return;
    summaries = summaries.filter(s => s.id !== id);
    renderSummaries();
  } catch { showToast('Impossible de contacter le serveur.', 'error'); }
}

// Fermeture modal résumé
document.getElementById('summaryModalClose')?.addEventListener('click',  () => closeModal('summaryModal'));
document.getElementById('summaryModalCancel')?.addEventListener('click', () => closeModal('summaryModal'));
document.getElementById('summaryModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('summaryModal')) closeModal('summaryModal');
});

// Recherche résumés
document.getElementById('summarySearch')?.addEventListener('input', (e) => {
  summarySearch = e.target.value.trim();
  renderSummaries();
});

// ===== ADMIN =====

// Récupère et affiche le code d'inscription du jour dans la section admin.
async function fetchAdminInviteCode() {
  const codeEl   = document.getElementById('adminInviteCode');
  const expireEl = document.getElementById('adminInviteExpire');
  if (!codeEl) return;
  codeEl.textContent = '…';
  try {
    const res  = await fetch(`${API}/admin/register-code`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { codeEl.textContent = 'Erreur'; return; }
    codeEl.textContent = data.code;

    // Calcul du temps restant avant expiration (minuit UTC)
    const now     = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const diffMs  = midnight - now;
    const hh      = Math.floor(diffMs / 3600000);
    const mm      = Math.floor((diffMs % 3600000) / 60000);
    if (expireEl) expireEl.textContent = `Expire dans ${hh}h ${mm}min (minuit UTC)`;
  } catch {
    codeEl.textContent = 'Erreur serveur';
  }
}

document.getElementById('btnRefreshInviteCode')?.addEventListener('click', fetchAdminInviteCode);

document.getElementById('btnCopyInviteCode')?.addEventListener('click', () => {
  const code = document.getElementById('adminInviteCode')?.textContent;
  if (!code || code === '…' || code === '——————') return;
  navigator.clipboard.writeText(code).then(() => showToast('Code copié !', 'success'));
});

// Cache local des utilisateurs pour la vue admin.
let adminUsers = [];

// Charge la liste complète des membres depuis l'endpoint admin (accès restreint aux admins).
// Affiche un état de chargement pendant la requête.
async function fetchAdminUsers() {
  const tbody = document.getElementById('adminUsersTbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">Chargement...</td></tr>';
  try {
    const res  = await fetch(`${API}/admin/users`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { tbody.innerHTML = `<tr><td colspan="5" class="admin-empty">${data.error}</td></tr>`; return; }
    adminUsers = data;
    renderAdminUsers();
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">Impossible de contacter le serveur.</td></tr>';
  }
}

function renderAdminUsers() {
  const tbody = document.getElementById('adminUsersTbody');
  if (!tbody) return;
  if (adminUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">Aucun membre enregistré.</td></tr>';
    return;
  }
  tbody.innerHTML = adminUsers.map(u => `
    <tr>
      <td><span class="admin-username">${escapeHtml(u.username)}</span></td>
      <td>${escapeHtml(u.rp_name)}</td>
      <td>
        <span class="badge ${u.is_admin ? 'badge-admin' : 'badge-member'}">
          ${u.is_admin ? ' Admin' : ' Membre'}
        </span>
      </td>
      <td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
      <td class="admin-actions">
        <button class="btn-edit" data-reset-id="${u.id}" data-reset-name="${escapeHtml(u.username)}"> Réinitialiser mdp</button>
        ${u.id !== currentUser?.id ? `
          <button class="btn-edit" data-toggle-admin="${u.id}">${u.is_admin ? '⬇ Rétrograder' : '⬆ Promouvoir'}</button>
          <button class="btn-delete" data-admin-del="${u.id}">✕</button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

document.getElementById('adminUsersTbody')?.addEventListener('click', async (e) => {
  // Reset mot de passe
  const resetBtn = e.target.closest('[data-reset-id]');
  if (resetBtn) {
    document.getElementById('resetPwdUserId').value = resetBtn.dataset.resetId;
    document.getElementById('resetPwdTitle').textContent = `Réinitialiser : ${resetBtn.dataset.resetName}`;
    document.getElementById('resetPwdInput').value = '';
    document.getElementById('resetPwdError').textContent = '';
    openModal('resetPwdModal');
    return;
  }
  // Toggle admin
  const toggleBtn = e.target.closest('[data-toggle-admin]');
  if (toggleBtn) {
    const id = toggleBtn.dataset.toggleAdmin;
    try {
      const res = await fetch(`${API}/admin/users/${id}/toggle-admin`, { method: 'PATCH', headers: authHeaders() });
      if (res.ok) fetchAdminUsers();
    } catch {}
    return;
  }
  // Supprimer
  const delBtn = e.target.closest('[data-admin-del]');
  if (delBtn) {
    const userId = delBtn.dataset.adminDel;
    confirmAction('Supprimer ce membre définitivement ? Cette action est irréversible.', async () => {
      try {
        const res = await fetch(`${API}/admin/users/${userId}`, { method: 'DELETE', headers: authHeaders() });
        if (res.ok) { fetchAdminUsers(); showToast('Membre supprimé.', 'success'); }
        else showToast('Erreur lors de la suppression.', 'error');
      } catch { showToast('Impossible de contacter le serveur.', 'error'); }
    });
  }
});

// Confirmer reset mot de passe
document.getElementById('btnConfirmResetPwd')?.addEventListener('click', async () => {
  const id  = document.getElementById('resetPwdUserId').value;
  const pwd = document.getElementById('resetPwdInput').value.trim();
  const err = document.getElementById('resetPwdError');
  err.textContent = '';
  if (!pwd) { err.textContent = 'Entrez un nouveau mot de passe.'; return; }
  try {
    const res  = await fetch(`${API}/admin/users/${id}/reset-password`, {
      method: 'PATCH', headers: authHeaders(),
      body: JSON.stringify({ newPassword: pwd }),
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error; return; }
    closeModal('resetPwdModal');
  } catch { err.textContent = 'Impossible de contacter le serveur.'; }
});

document.getElementById('resetPwdClose')?.addEventListener('click',  () => closeModal('resetPwdModal'));
document.getElementById('resetPwdCancel')?.addEventListener('click', () => closeModal('resetPwdModal'));
document.getElementById('resetPwdModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('resetPwdModal')) closeModal('resetPwdModal');
});

// ===== HISTORIQUE DES MODIFICATIONS =====
// Cache local des entrées d'audit et filtre actif par type d'entité.
let auditLogs   = [];
let logFilter   = 'all';   // 'all' | 'Groupe' | 'Mission' | 'Résumé' | 'Arme' | 'Véhicule' | 'Transaction'

// Charge l'historique complet des modifications effectuées par les membres.
async function fetchLogs() {
  const tbody = document.getElementById('logsTbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Chargement...</td></tr>';
  try {
    const res  = await fetch(`${API}/logs`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">${data.error}</td></tr>`; return; }
    auditLogs = data;
    renderLogs();
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Impossible de contacter le serveur.</td></tr>';
  }
}

function renderLogs() {
  const tbody = document.getElementById('logsTbody');
  if (!tbody) return;
  const list = logFilter === 'all' ? auditLogs : auditLogs.filter(l => l.entity_type === logFilter);
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Aucune entrée.</td></tr>';
    return;
  }
  const actionKey = (a) => a.replace(/\s+/g, '-');
  tbody.innerHTML = list.map(l => `
    <tr>
      <td class="td-date">${new Date(l.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' })} ${new Date(l.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}</td>
      <td>${escapeHtml(l.user_rp_name || '—')}</td>
      <td><span class="log-action-badge log-action-${escapeHtml(actionKey(l.action))}">${escapeHtml(l.action)}</span></td>
      <td>${escapeHtml(l.entity_type)}</td>
      <td>${escapeHtml(l.entity_name || '—')}</td>
      <td style="color:var(--text-2);font-size:.85rem">${escapeHtml(l.details || '')}</td>
    </tr>`).join('');
}

// Filtres logs
document.querySelectorAll('[data-lfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-lfilter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    logFilter = btn.dataset.lfilter;
    renderLogs();
  });
});

document.getElementById('btnRefreshLogs')?.addEventListener('click', fetchLogs);

// ===== COTISATIONS PAR MEMBRE ET PAR SEMAINE =====
// Filtre courant : 'entree' (cotisations uniquement) ou 'all' (toutes transactions).
let cotisationsFilter = 'entree';

// Calcule la clé ISO 8601 de la semaine (ex : "2025-W03") à partir d'une date ISO.
// Algorithme : trouve le jeudi de la semaine courante (ref ISO), puis en déduit le numéro.
// Cela garantit que le jour 1 de la semaine 1 est toujours un lundi.
function getISOWeekKey(dateStr) {
  const d    = new Date(dateStr);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // getUTCDay() retourne 0 pour dimanche, on le remplace par 7 pour l'ISO (lundi=1, dimanche=7)
  const dayNum = date.getUTCDay() || 7;
  // Recale la date au jeudi de la même semaine ISO
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum   = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Transforme la clé ISO (ex : "2025-W03") en label lisible (ex : "S03 · 2025").
function formatWeekLabel(weekKey) {
  const [year, wPart] = weekKey.split('-W');
  return `S${wPart} · ${year}`;
}

// Construit un tableau croisé dynamique (pivot) : lignes = membres, colonnes = 12 dernières semaines.
// Chaque cellule contient la somme des montants pour ce membre cette semaine.
// Une ligne de totaux par colonne et un grand total général sont ajoutés en pied de tableau.
function renderCotisationsTable() {
  const wrap = document.getElementById('cotisationsTableWrap');
  if (!wrap) return;

  const list = cotisationsFilter === 'entree'
    ? transactions.filter(t => t.type === 'entree')
    : transactions;

  if (list.length === 0) {
    wrap.innerHTML = '<p class="admin-empty">Aucune transaction à afficher.</p>';
    return;
  }

  // pivot[membre][semaine] = montant cumulé
  const pivot   = {};
  const weeksSet = new Set();

  list.forEach(t => {
    const wk = getISOWeekKey(t.created_at);
    weeksSet.add(wk);
    if (!pivot[t.member]) pivot[t.member] = {};
    pivot[t.member][wk] = (pivot[t.member][wk] || 0) + Number(t.amount);
  });

  const weeks   = [...weeksSet].sort((a, b) => b.localeCompare(a)).slice(0, 12);
  const members = Object.keys(pivot).sort();

  let html = `<div class="cotisations-scroll"><table class="admin-table cotisations-table">
    <thead><tr>
      <th class="coti-th-member">Membre</th>
      ${weeks.map(wk => `<th class="coti-th-week">${escapeHtml(formatWeekLabel(wk))}</th>`).join('')}
      <th class="coti-th-total">Total</th>
    </tr></thead>
    <tbody>`;

  members.forEach(member => {
    const rowTotal = weeks.reduce((sum, wk) => sum + (pivot[member][wk] || 0), 0);
    html += `<tr>
      <td class="coti-member">${escapeHtml(member)}</td>
      ${weeks.map(wk => {
        const val = pivot[member][wk];
        return val
          ? `<td class="coti-cell coti-has">${formatAmount(val)}</td>`
          : `<td class="coti-cell coti-empty">—</td>`;
      }).join('')}
      <td class="coti-cell coti-row-total">${formatAmount(rowTotal)}</td>
    </tr>`;
  });

  const grandTotal = list.reduce((s, t) => s + Number(t.amount), 0);
  html += `<tr class="coti-footer-row">
    <td class="coti-member"><strong>Total</strong></td>
    ${weeks.map(wk => {
      const wkTotal = members.reduce((sum, m) => sum + (pivot[m][wk] || 0), 0);
      return `<td class="coti-cell coti-row-total">${wkTotal > 0 ? formatAmount(wkTotal) : '—'}</td>`;
    }).join('')}
    <td class="coti-cell coti-grand-total">${formatAmount(grandTotal)}</td>
  </tr>`;

  html += '</tbody></table></div>';
  wrap.innerHTML = html;
}

document.querySelectorAll('[data-cfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-cfilter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    cotisationsFilter = btn.dataset.cfilter;
    renderCotisationsTable();
  });
});

document.getElementById('btnRefreshCotisations')?.addEventListener('click', fetchTransactions);

// ===== GRAPHIQUES COMPTABILITÉ =====
// Instance Chart.js courante — conservée pour pouvoir la détruire avant de la recréer.
let chartBalanceInst = null;

// Calcule le solde cumulatif (running total) transaction par transaction dans l'ordre chronologique,
// puis affiche une courbe de tendance du solde avec Chart.js.
// L'instance précédente est détruite pour éviter les doublons de canvas.
function renderBalanceChart(txData) {
  const canvas = document.getElementById('chartBalance');
  if (!canvas || !window.Chart) return;
  if (chartBalanceInst) chartBalanceInst.destroy();

  // Tri chronologique pour que la courbe soit dans le bon sens.
  const sorted = [...txData].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  let running = 0;
  const labels = [], data = [];
  sorted.forEach(t => {
    running += t.type === 'entree' ? t.amount : -t.amount;
    labels.push(new Date(t.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }));
    data.push(running);
  });

  chartBalanceInst = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Solde', data, borderColor: '#ffffff', backgroundColor: 'rgba(255,255,255,0.07)',
        tension: 0.3, fill: true, pointRadius: 3 }],
    },
    options: { responsive: true, plugins: { legend: { display: false } },
      scales: { x: { ticks: { color:'#888', maxTicksLimit: 8 }, grid: { color:'#2a2a3a' } },
                y: { ticks: { color:'#888' }, grid: { color:'#2a2a3a' } } } },
  });
}


// ===== MISSIONS =====
// Cache local des missions et filtre actif par statut.
let missions      = [];
let missionFilter = 'all';   // 'all' | 'en_cours' | 'termine' | 'echoue'

// Labels d'affichage pour les statuts et priorités (utilisés dans les cartes et les selects).
const MISSION_STATUS_LABELS = { en_cours: ' En cours', termine: ' Terminée', echoue: ' Échouée' };
const MISSION_PRIORITY_LABELS = { basse: ' Basse', normale: ' Normale', haute: ' Haute' };

function updateMissionBadge() {
  const badge = document.getElementById('badgeMissions');
  if (!badge) return;
  const count = missions.filter(m => m.status === 'en_cours').length;
  if (count > 0) { badge.textContent = count; badge.style.display = ''; }
  else { badge.style.display = 'none'; }
}

async function fetchMissions() {
  try {
    const res  = await fetch(`${API}/missions`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    missions = data;
    renderMissions();
    updateMissionBadge();
  } catch { console.error('Erreur chargement missions.'); }
}

function getFilteredMissions() {
  if (missionFilter === 'all') return missions;
  return missions.filter(m => m.status === missionFilter);
}

// Génère les chips de sélection des membres assignés à une mission.
function buildMissionMembersSelector(selectedIds = []) {
  const container = document.getElementById('missionMembersSelector');
  if (!container) return;
  container.innerHTML = '';
  members.forEach(m => {
    const chip = document.createElement('span');
    // Les ids sont comparés en String car data-mid est une string et selectedIds peut contenir des strings
    chip.className   = 'zone-chip' + (selectedIds.includes(String(m.id)) ? ' selected' : '');
    chip.textContent = m.rp_name;
    chip.dataset.mid = m.id;
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
    container.appendChild(chip);
  });
}

// Retourne les ids des membres sélectionnés sous forme de chaîne CSV pour l'API.
function getSelectedMissionMembers() {
  return Array.from(document.querySelectorAll('#missionMembersSelector .zone-chip.selected'))
    .map(c => c.dataset.mid).join(',');
}

// Résout une liste d'ids membres (format CSV) en noms RP lisibles.
// Si un id n'est pas trouvé dans le cache local, il est retourné tel quel (fallback).
function getMemberNames(ids) {
  if (!ids) return '';
  return ids.split(',').filter(Boolean).map(id => {
    const m = members.find(m => String(m.id) === id);
    return m ? m.rp_name : id;
  }).join(', ');
}

function renderMissions() {
  const grid  = document.getElementById('missionsGrid');
  const empty = document.getElementById('missionsEmpty');
  const list  = getFilteredMissions();
  Array.from(grid.querySelectorAll('.mission-card')).forEach(c => c.remove());
  if (list.length === 0) { empty.style.display = ''; return; }
  empty.style.display = 'none';

  list.forEach(m => {
    const card = document.createElement('div');
    card.className = `mission-card status-${m.status}`;
    card.innerHTML = `
      <div class="mission-card-header">
        <div class="mission-card-title-row">
          <span class="mission-priority-dot priority-${m.priority}"></span>
          <span class="mission-card-title">${escapeHtml(m.title)}</span>
        </div>
        <div class="mission-card-badges">
          <span class="mission-status-badge status-badge-${m.status}">${MISSION_STATUS_LABELS[m.status]}</span>
          ${currentUser?.id === m.created_by ? `
            <button class="btn-edit" data-mission-edit="${m.id}"></button>
            <button class="btn-delete" data-mission-del="${m.id}">✕</button>
          ` : ''}
        </div>
      </div>
      ${m.description ? `<div class="mission-card-desc">${escapeHtml(m.description)}</div>` : ''}
      ${m.assigned_ids ? `<div class="mission-card-members"> ${escapeHtml(getMemberNames(m.assigned_ids))}</div>` : ''}
      <div class="mission-card-footer">
        <span>Par ${escapeHtml(m.created_by_name || '—')}</span>
        <div class="mission-status-controls">
          <select class="mission-status-select form-input form-select" data-mission-status="${m.id}">
            <option value="en_cours"  ${m.status==='en_cours'  ? 'selected':''}> En cours</option>
            <option value="termine"   ${m.status==='termine'   ? 'selected':''}> Terminée</option>
            <option value="echoue"    ${m.status==='echoue'    ? 'selected':''}> Échouée</option>
          </select>
        </div>
      </div>`;
    grid.appendChild(card);
  });
  applyStagger(grid);
}

// Filtres missions
document.querySelectorAll('[data-mfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-mfilter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    missionFilter = btn.dataset.mfilter;
    renderMissions();
  });
});

// Ouvrir modal ajout
document.getElementById('btnOpenAddMission')?.addEventListener('click', () => {
  document.getElementById('missionModalTitle').textContent = 'Nouvelle mission';
  document.getElementById('missionEditId').value  = '';
  document.getElementById('missionTitle').value   = '';
  document.getElementById('missionDesc').value    = '';
  document.getElementById('missionPriority').value = 'normale';
  document.getElementById('missionError').textContent = '';
  buildMissionMembersSelector();
  openModal('missionModal');
});

// Clic grille missions
document.getElementById('missionsGrid')?.addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-mission-edit]');
  const delBtn  = e.target.closest('[data-mission-del]');
  const selEl   = e.target.closest('[data-mission-status]');

  if (editBtn) {
    const m = missions.find(m => m.id === Number(editBtn.dataset.missionEdit));
    if (!m) return;
    document.getElementById('missionModalTitle').textContent = 'Modifier la mission';
    document.getElementById('missionEditId').value   = m.id;
    document.getElementById('missionTitle').value    = m.title;
    document.getElementById('missionDesc').value     = m.description || '';
    document.getElementById('missionPriority').value = m.priority;
    document.getElementById('missionError').textContent = '';
    buildMissionMembersSelector(m.assigned_ids ? m.assigned_ids.split(',') : []);
    openModal('missionModal');
  }
  if (delBtn) {
    const id = Number(delBtn.dataset.missionDel);
    confirmAction('Supprimer cette mission ?', async () => {
      try {
        const res = await fetch(`${API}/missions/${id}`, { method:'DELETE', headers: authHeaders() });
        if (res.ok) { missions = missions.filter(m => m.id !== id); renderMissions(); updateMissionBadge(); showToast('Mission supprimée.'); }
        else showToast('Erreur lors de la suppression.', 'error');
      } catch { showToast('Impossible de contacter le serveur.', 'error'); }
    });
  }
});

// Changement statut via select
document.getElementById('missionsGrid')?.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-mission-status]');
  if (!sel) return;
  const id = Number(sel.dataset.missionStatus);
  try {
    const res  = await fetch(`${API}/missions/${id}/status`, {
      method:'PATCH', headers: authHeaders(), body: JSON.stringify({ status: sel.value }),
    });
    const data = await res.json();
    if (res.ok) { const idx = missions.findIndex(m => m.id === id); if (idx !== -1) missions[idx] = data; renderMissions(); updateMissionBadge(); }
  } catch {}
});

// Sauvegarder mission
document.getElementById('btnSaveMission')?.addEventListener('click', async () => {
  const id          = document.getElementById('missionEditId').value;
  const title       = document.getElementById('missionTitle').value.trim();
  const description = document.getElementById('missionDesc').value.trim();
  const priority    = document.getElementById('missionPriority').value;
  const assigned_ids = getSelectedMissionMembers();
  const errorEl     = document.getElementById('missionError');
  errorEl.textContent = '';
  if (!title) { errorEl.textContent = 'Le titre est requis.'; return; }

  const isEdit = id !== '';
  const url    = isEdit ? `${API}/missions/${id}` : `${API}/missions`;
  const method = isEdit ? 'PUT' : 'POST';
  const btn    = document.getElementById('btnSaveMission');
  btn.disabled = true; btn.textContent = 'Enregistrement...';

  try {
    const res  = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify({ title, description, priority, assigned_ids }) });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'Erreur.'; return; }
    if (isEdit) { const idx = missions.findIndex(m => m.id === Number(id)); if (idx !== -1) missions[idx] = data; }
    else missions.unshift(data);
    renderMissions();
    updateMissionBadge();
    closeModal('missionModal');
    showToast(isEdit ? 'Mission modifiée.' : 'Mission créée.');
  } catch { errorEl.textContent = 'Impossible de contacter le serveur.'; }
  finally { btn.disabled = false; btn.textContent = 'Enregistrer'; }
});

document.getElementById('missionModalClose')?.addEventListener('click',  () => closeModal('missionModal'));
document.getElementById('missionModalCancel')?.addEventListener('click', () => closeModal('missionModal'));
document.getElementById('missionModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('missionModal')) closeModal('missionModal');
});

// ===== PROFIL MEMBRE =====
// Charge le profil complet d'un membre depuis l'API (armes, véhicules, transactions associés),
// peuple la modale et l'ouvre. Accessible en cliquant sur un membre dans le dashboard ou l'admin.
async function openMemberProfile(memberId) {
  try {
    const res  = await fetch(`${API}/members/${memberId}/profile`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    // Destructuration : l'API retourne un objet { user, weapons, vehicles, transactions }
    const { user, weapons: w, vehicles: v, transactions: tx } = data;

    document.getElementById('profileModalTitle').textContent = user.rp_name;
    document.getElementById('profileRpName').textContent     = user.rp_name;
    document.getElementById('profileUsername').textContent   = `@${user.username}`;
    document.getElementById('profileSince').textContent      = `Membre depuis le ${new Date(user.created_at).toLocaleDateString('fr-FR')}`;
    document.getElementById('profileAvatar').textContent     = user.rp_name.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2);
    document.getElementById('profileTxCount').textContent    = tx.length;
    document.getElementById('profileWeaponCount').textContent  = w.length;
    document.getElementById('profileVehicleCount').textContent = v.length;

    document.getElementById('profileWeapons').innerHTML = w.length
      ? w.map(x => `<div class="profile-item"><span>${escapeHtml(x.name)}</span><span class="profile-item-sub">${escapeHtml(x.category)}</span></div>`).join('')
      : '<p class="dash-empty">Aucune arme attribuée.</p>';

    document.getElementById('profileVehicles').innerHTML = v.length
      ? v.map(x => `<div class="profile-item"><span>${escapeHtml(x.name)}</span><span class="profile-item-sub">${escapeHtml(x.category)}</span></div>`).join('')
      : '<p class="dash-empty">Aucun véhicule attribué.</p>';

    document.getElementById('profileTx').innerHTML = tx.length
      ? tx.map(t => `
        <div class="profile-item">
          <span class="${t.type === 'entree' ? 'dash-list-badge badge-income' : 'dash-list-badge badge-expense'}">${t.type==='entree'?'+':'-'}${formatAmount(t.amount)}</span>
          <span>${escapeHtml(t.motif || '—')}</span>
          <span class="profile-item-sub">${new Date(t.created_at).toLocaleDateString('fr-FR')}</span>
        </div>`).join('')
      : '<p class="dash-empty">Aucune transaction.</p>';

    openModal('memberProfileModal');
  } catch { console.error('Erreur profil membre.'); }
}

document.getElementById('profileModalClose')?.addEventListener('click', () => closeModal('memberProfileModal'));
document.getElementById('memberProfileModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('memberProfileModal')) closeModal('memberProfileModal');
});

// Clic sur membres dans le tableau admin
document.getElementById('adminUsersTbody')?.addEventListener('click', (e) => {
  const rpName = e.target.closest('tr')?.querySelector('.admin-username');
  if (rpName && !e.target.closest('button')) {
    const row = e.target.closest('tr');
    const id  = adminUsers.find(u => u.username === rpName.textContent)?.id;
    if (id) openMemberProfile(id);
  }
}, true);

// ===== DATE DISPLAY =====
// Affiche la date courante dans la topbar au format long (ex : "Samedi 18 avril 2026").
// La première lettre est mise en majuscule car toLocaleDateString retourne parfois en minuscule.
function updateDate() {
  const now     = new Date();
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const fmt     = now.toLocaleDateString('fr-FR', options);
  const el      = document.getElementById('dateDisplay');
  if (el) el.textContent = fmt.charAt(0).toUpperCase() + fmt.slice(1);
}

updateDate();

// ===== PROFIL ÉDITABLE =====
(function () {
  const overlay    = document.getElementById('profileEditModal');
  const closeBtn   = document.getElementById('profileEditClose');
  const cancelBtn  = document.getElementById('profileEditCancel');
  const saveBtn    = document.getElementById('btnSaveProfile');
  const rpNameEl   = document.getElementById('profileEditRpName');
  const curPwdEl   = document.getElementById('profileEditCurrentPwd');
  const newPwdEl   = document.getElementById('profileEditNewPwd');
  const errorEl    = document.getElementById('profileEditError');
  const userChip   = document.getElementById('userChip');

  function openProfileModal() {
    if (!currentUser) return;
    rpNameEl.value  = currentUser.rp_name || '';
    curPwdEl.value  = '';
    newPwdEl.value  = '';
    errorEl.style.display = 'none';
    errorEl.textContent   = '';
    overlay.classList.add('open');
  }

  function closeProfileModal() {
    overlay.classList.remove('open');
  }

  userChip?.addEventListener('click', openProfileModal);
  closeBtn?.addEventListener('click',  closeProfileModal);
  cancelBtn?.addEventListener('click', closeProfileModal);
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeProfileModal(); });

  saveBtn?.addEventListener('click', async () => {
    const rp_name        = rpNameEl.value.trim();
    const current_password = curPwdEl.value;
    const new_password   = newPwdEl.value;

    if (!rp_name && !new_password) {
      errorEl.textContent = 'Aucune modification détectée.';
      errorEl.style.display = '';
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Enregistrement...';
    errorEl.style.display = 'none';

    try {
      const body = {};
      if (rp_name) body.rp_name = rp_name;
      if (new_password) { body.current_password = current_password; body.new_password = new_password; }

      const res  = await fetch(`${API}/auth/profile`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        errorEl.textContent = data.error || 'Erreur.';
        errorEl.style.display = '';
        return;
      }

      // Mise à jour de la session
      authToken   = data.token;
      currentUser = data.user;
      localStorage.setItem('authToken', authToken);

      // Mise à jour de l'affichage
      const rpNameDisplay = document.getElementById('userRpName');
      const avatarEl      = document.getElementById('userAvatar');
      if (rpNameDisplay) rpNameDisplay.textContent = data.user.rp_name;
      if (avatarEl) avatarEl.textContent = data.user.rp_name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);

      closeProfileModal();
      showToast('Profil mis à jour.');
    } catch {
      errorEl.textContent = 'Impossible de contacter le serveur.';
      errorEl.style.display = '';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Enregistrer';
    }
  });
})();

// ===== ADMIN COLLAPSIBLE SECTIONS =====
// Rend les en-têtes des cartes admin cliquables pour réduire/agrandir leur contenu.
// Les clics sur le bouton "Actualiser" (btn-refresh) sont ignorés pour ne pas déclencher
// le toggle en même temps qu'un rechargement des données.
document.querySelectorAll('.admin-card-header-toggle').forEach(header => {
  header.addEventListener('click', (e) => {
    if (e.target.closest('.btn-refresh')) return;
    const targetId = header.dataset.target;
    const body = document.getElementById(targetId);
    const btn = header.querySelector('.btn-collapse-toggle');
    if (!body || !btn) return;
    const isCollapsed = body.classList.toggle('collapsed');
    // Adapte l'icône du bouton selon l'état (+ = réduit, − = ouvert).
    btn.textContent = isCollapsed ? '+' : '−';
  });
});
