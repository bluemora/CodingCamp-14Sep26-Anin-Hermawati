/* ============================================================
   EXPENSE & BUDGET VISUALIZER — app.js
   Single JS file. No frameworks. Vanilla JS only.

   Features:
   - (8)  Input Form: item name, amount, category, type, date
          Validation: all fields required, amount must be valid
          Behavior: submit adds transaction, form resets after
   - (9)  Transaction List: scrollable, shows name/amount/category, delete button
   - (10) Total Balance: auto-calculated, updates on add/delete
   - (11) Pie Chart via Chart.js CDN, auto-updates on data change

   Optional Challenges:
   - OC1: Dark / Light mode toggle (saved to Local Storage)
   - OC2: Highlight spending over a set monthly budget limit
   - OC3: Monthly summary view (filter by month) + sort by date/amount/category

   Local Storage:
   - Save transactions on every add/delete
   - Load transactions on page load
   - Save/load theme preference
   - Save/load budget limit
   - Save/load custom categories
   ============================================================ */

'use strict';

/* ── Storage Keys ── */
const KEYS = {
  transactions: 'bgt_transactions',
  theme:        'bgt_theme',
  budget:       'bgt_budget',
  categories:   'bgt_categories',
};

/* ── Default categories (Feature 8: Food, Transport, Fun minimum) ── */
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];

/* ── Category emoji map ── */
const CATEGORY_ICONS = {
  Food:      '🍔',
  Transport: '🚗',
  Fun:       '🎮',
  Shopping:  '🛍️',
  Health:    '💊',
  Bills:     '📄',
  Income:    '💵',
  Other:     '📦',
};

/* ── Chart.js colour palette ── */
const CHART_COLOURS = [
  '#6c63ff', '#f59e0b', '#10b981', '#ef4444',
  '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6',
  '#f97316', '#84cc16',
];

/**
 * Stable category → colour map.
 * Once a category is assigned a colour it never changes,
 * even if other categories are added or removed.
 */
const categoryColourMap = {};

function getCategoryColour(categoryName) {
  if (!categoryColourMap[categoryName]) {
    const usedCount = Object.keys(categoryColourMap).length;
    categoryColourMap[categoryName] = CHART_COLOURS[usedCount % CHART_COLOURS.length];
  }
  return categoryColourMap[categoryName];
}

/* ── App State ── */
let transactions  = [];   // array of transaction objects
let categories    = [];   // array of category name strings
let budgetLimit   = 0;    // 0 means no limit set
let currentSort   = 'date';  // 'date' | 'amount' | 'category'
let monthFilter   = '';   // 'YYYY-MM' or '' for all
let pieChart      = null; // Chart.js instance

/* ══════════════════════════════════════════
   LOCAL STORAGE HELPERS
   ══════════════════════════════════════════ */

/** Save current transactions array to Local Storage */
function saveTransactions() {
  localStorage.setItem(KEYS.transactions, JSON.stringify(transactions));
}

/** Load transactions from Local Storage; returns array */
function loadTransactions() {
  const raw = localStorage.getItem(KEYS.transactions);
  return raw ? JSON.parse(raw) : [];
}

/** Save categories to Local Storage */
function saveCategories() {
  localStorage.setItem(KEYS.categories, JSON.stringify(categories));
}

/** Load categories from Local Storage; merges with defaults */
function loadCategories() {
  const raw = localStorage.getItem(KEYS.categories);
  const saved = raw ? JSON.parse(raw) : [];
  // Merge: ensure defaults always present
  const merged = [...DEFAULT_CATEGORIES];
  saved.forEach((c) => {
    if (!merged.includes(c)) merged.push(c);
  });
  return merged;
}

/** Save budget limit to Local Storage */
function saveBudget() {
  localStorage.setItem(KEYS.budget, String(budgetLimit));
}

/** Load budget limit from Local Storage */
function loadBudget() {
  const raw = localStorage.getItem(KEYS.budget);
  return raw ? parseFloat(raw) : 0;
}

/** Save theme to Local Storage */
function saveTheme(theme) {
  localStorage.setItem(KEYS.theme, theme);
}

/** Load theme from Local Storage; defaults to 'light' */
function loadTheme() {
  return localStorage.getItem(KEYS.theme) || 'light';
}

/* ══════════════════════════════════════════
   BALANCE CALCULATION (Feature 10)
   ══════════════════════════════════════════ */

/** Sum all income transactions */
function calcIncome(txList) {
  return txList
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
}

/** Sum all expense transactions */
function calcExpense(txList) {
  return txList
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
}

/** Format a number as currency string */
function fmt(amount) {
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* ══════════════════════════════════════════
   FILTER & SORT HELPERS (OC3)
   ══════════════════════════════════════════ */

/** Filter transactions by currently selected month (or return all) */
function getFilteredTransactions() {
  if (!monthFilter) return [...transactions];
  return transactions.filter((t) => t.date.startsWith(monthFilter));
}

/** Sort an array of transactions by currentSort */
function getSortedTransactions(txList) {
  const list = [...txList];
  if (currentSort === 'amount') {
    list.sort((a, b) => b.amount - a.amount);
  } else if (currentSort === 'category') {
    list.sort((a, b) => a.category.localeCompare(b.category));
  } else {
    // default: date descending
    list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  return list;
}

/* ══════════════════════════════════════════
   RENDER — BALANCE (Feature 10)
   ══════════════════════════════════════════ */

function renderBalance() {
  const visible = getFilteredTransactions();
  const income  = calcIncome(visible);
  const expense = calcExpense(visible);
  const balance = income - expense;

  document.getElementById('totalBalance').textContent = fmt(balance);
  document.getElementById('totalIncome').textContent  = fmt(income);
  document.getElementById('totalExpense').textContent = fmt(expense);

  // OC2: Highlight if over budget limit
  const warning = document.getElementById('budgetWarning');
  if (budgetLimit > 0 && expense > budgetLimit) {
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }
}

/* ══════════════════════════════════════════
   RENDER — TRANSACTION LIST (Feature 9)
   ══════════════════════════════════════════ */

function renderTransactions() {
  const list    = document.getElementById('txList');
  const empty   = document.getElementById('txEmpty');
  const countEl = document.getElementById('txCount');

  const visible = getSortedTransactions(getFilteredTransactions());

  list.innerHTML = '';

  if (visible.length === 0) {
    empty.classList.remove('hidden');
    countEl.textContent = '0 items';
    return;
  }

  empty.classList.add('hidden');
  countEl.textContent = `${visible.length} item${visible.length !== 1 ? 's' : ''}`;

  visible.forEach((tx) => {
    const icon    = CATEGORY_ICONS[tx.category] || '📦';
    const isOver  = budgetLimit > 0 && tx.type === 'expense' && tx.amount > budgetLimit;
    const sign    = tx.type === 'income' ? '+' : '-';

    const li = document.createElement('li');
    li.className = `tx-item${isOver ? ' over-limit' : ''}`;
    li.setAttribute('data-id', tx.id);

    li.innerHTML = `
      <div class="tx-icon" aria-hidden="true">${icon}</div>
      <div class="tx-info">
        <p class="tx-name">${escapeHtml(tx.name)}</p>
        <p class="tx-meta">${escapeHtml(tx.category)} &bull; ${tx.date}</p>
      </div>
      <div class="tx-right">
        <span class="tx-amount ${tx.type}">${sign}${fmt(tx.amount)}</span>
        <button class="tx-delete" data-id="${tx.id}" aria-label="Delete transaction ${escapeHtml(tx.name)}">🗑 Delete</button>
      </div>
    `;

    list.appendChild(li);
  });

  // Attach delete handlers
  list.querySelectorAll('.tx-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
  });
}

/* ══════════════════════════════════════════
   RENDER — PIE CHART (Feature 11)
   ══════════════════════════════════════════ */

function renderChart() {
  const canvas   = document.getElementById('spendingChart');
  const emptyMsg = document.getElementById('chartEmpty');

  const visible  = getFilteredTransactions();
  const expenses = visible.filter((t) => t.type === 'expense');

  if (expenses.length === 0) {
    emptyMsg.classList.remove('hidden');
    canvas.classList.add('hidden');
    if (pieChart) {
      pieChart.destroy();
      pieChart = null;
    }
    return;
  }

  emptyMsg.classList.add('hidden');
  canvas.classList.remove('hidden');

  // Aggregate by category
  const totals = {};
  expenses.forEach((t) => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });

  const labels  = Object.keys(totals);
  const data    = Object.values(totals);
  const colours = labels.map((cat) => getCategoryColour(cat));

  if (pieChart) {
    // Update existing chart (no flicker)
    pieChart.data.labels          = labels;
    pieChart.data.datasets[0].data   = data;
    pieChart.data.datasets[0].backgroundColor = colours;
    pieChart.update();
  } else {
    // Create new chart
    pieChart = new Chart(canvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colours,
          borderWidth: 2,
          borderColor: getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#fff',
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 16,
              font: { size: 13, family: "'Segoe UI', system-ui, sans-serif" },
              color: getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a2e',
            },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const val   = ctx.parsed;
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = ((val / total) * 100).toFixed(1);
                return ` ${fmt(val)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }
}

/* ══════════════════════════════════════════
   RENDER — CATEGORY <SELECT>
   ══════════════════════════════════════════ */

/**
 * Rebuild the category <select> options.
 * @param {string|null} forceValue - if provided, select this value after render.
 *   If null/undefined, restore the previously selected value instead.
 */
function renderCategorySelect(forceValue) {
  const select  = document.getElementById('txCategory');
  const current = forceValue !== undefined ? forceValue : select.value;
  select.innerHTML = '';

  categories.forEach((cat) => {
    const opt       = document.createElement('option');
    opt.value       = cat;
    opt.textContent = `${CATEGORY_ICONS[cat] || '📦'} ${cat}`;
    select.appendChild(opt);
  });

  // Set to forceValue (new custom cat) or restore previous selection
  if (current && categories.includes(current)) {
    select.value = current;
  }
}

/* ══════════════════════════════════════════
   MASTER RENDER — calls all render functions
   ══════════════════════════════════════════ */

function renderAll() {
  renderBalance();
  renderTransactions();
  renderChart();
}

/* ══════════════════════════════════════════
   ADD TRANSACTION (Feature 8)
   ══════════════════════════════════════════ */

function addTransaction(name, amount, category, type, date) {
  const tx = {
    id:       crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
    name,
    amount:   parseFloat(amount),
    category,
    type,
    date,
    createdAt: Date.now(),
  };

  transactions.unshift(tx); // prepend so newest is first
  saveTransactions();       // persist to Local Storage
  renderAll();
}

/* ══════════════════════════════════════════
   DELETE TRANSACTION (Feature 9 + Local Storage)
   ══════════════════════════════════════════ */

function deleteTransaction(id) {
  transactions = transactions.filter((t) => t.id !== id);
  saveTransactions(); // update Local Storage after delete
  renderAll();
}

/* ══════════════════════════════════════════
   FORM VALIDATION & SUBMIT (Feature 8)
   ══════════════════════════════════════════ */

function handleFormSubmit(e) {
  e.preventDefault();

  const nameEl     = document.getElementById('txName');
  const amountEl   = document.getElementById('txAmount');
  const categoryEl = document.getElementById('txCategory');
  const typeEl     = document.getElementById('txType');
  const dateEl     = document.getElementById('txDate');
  const errorEl    = document.getElementById('formError');

  const name     = nameEl.value.trim();
  const amount   = amountEl.value.trim();
  const category = categoryEl.value;
  const type     = typeEl.value;
  const date     = dateEl.value;

  // Validation: all fields required
  if (!name) {
    showError(errorEl, 'Item Name is required.');
    nameEl.focus();
    return;
  }

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    showError(errorEl, 'Please enter a valid positive amount.');
    amountEl.focus();
    return;
  }

  if (!date) {
    showError(errorEl, 'Date is required.');
    dateEl.focus();
    return;
  }

  // Clear error
  errorEl.classList.add('hidden');
  errorEl.textContent = '';

  // Add and reset form
  addTransaction(name, amount, category, type, date);
  resetForm();
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

/** Reset form back to empty after successful submit */
function resetForm() {
  document.getElementById('txName').value   = '';
  document.getElementById('txAmount').value = '';
  document.getElementById('txDate').value   = '';
  document.getElementById('txType').value   = 'expense';
  // Keep category selection; user likely adds multiple in same category
  document.getElementById('formError').classList.add('hidden');
  document.getElementById('txName').focus();
}

/* ══════════════════════════════════════════
   CUSTOM CATEGORIES (Optional Challenge 1)
   ══════════════════════════════════════════ */

function handleAddCategory() {
  const input = document.getElementById('customCatInput');
  const name  = input.value.trim();

  if (!name) return;

  // Silently ignore duplicates (case-insensitive)
  if (categories.map((c) => c.toLowerCase()).includes(name.toLowerCase())) {
    input.value = '';
    return;
  }

  categories.push(name);
  saveCategories();
  // Pass the new name as forceValue so it is selected after render
  renderCategorySelect(name);
  input.value = '';
}

/* ══════════════════════════════════════════
   BUDGET LIMIT (Optional Challenge 2)
   ══════════════════════════════════════════ */

function handleSetBudget() {
  const input = document.getElementById('budgetLimitInput');
  const val   = parseFloat(input.value);

  if (!input.value || isNaN(val) || val < 0) return;

  budgetLimit = val;
  saveBudget();
  updateBudgetDisplay();
  renderAll();
  input.value = '';
}

function updateBudgetDisplay() {
  const display = document.getElementById('budgetLimitDisplay');
  display.textContent = budgetLimit > 0
    ? `Limit: ${fmt(budgetLimit)} / month`
    : 'No limit set.';
}

/* ══════════════════════════════════════════
   MONTH FILTER (Optional Challenge 3)
   ══════════════════════════════════════════ */

function handleMonthFilter(e) {
  monthFilter = e.target.value; // 'YYYY-MM' or ''
  renderAll();
}

function handleClearMonth() {
  monthFilter = '';
  document.getElementById('monthFilter').value = '';
  renderAll();
}

/* ══════════════════════════════════════════
   SORT (Optional Challenge 3)
   ══════════════════════════════════════════ */

function handleSort(e) {
  const btn = e.target.closest('.sort-btn');
  if (!btn) return;

  currentSort = btn.dataset.sort;

  // Update active button styling
  document.querySelectorAll('.sort-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');

  renderTransactions();
}

/* ══════════════════════════════════════════
   DARK / LIGHT MODE (Optional Challenge 1)
   ══════════════════════════════════════════ */

function applyTheme(theme) {
  document.body.classList.remove('light', 'dark');
  document.body.classList.add(theme);
  document.getElementById('themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}

function handleThemeToggle() {
  const isDark = document.body.classList.contains('dark');
  const next   = isDark ? 'light' : 'dark';
  applyTheme(next);
  saveTheme(next);

  // Re-render chart so colours update with new theme
  if (pieChart) {
    pieChart.destroy();
    pieChart = null;
  }
  renderChart();
}

/* ══════════════════════════════════════════
   SECURITY HELPER
   ══════════════════════════════════════════ */

/** Escape HTML to prevent XSS from user-entered text */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ══════════════════════════════════════════
   INITIALISATION — runs on page load
   ══════════════════════════════════════════ */

function init() {
  // 1. Load all persisted data from Local Storage
  transactions = loadTransactions();
  categories   = loadCategories();
  budgetLimit  = loadBudget();

  // 2. Apply saved theme
  applyTheme(loadTheme());

  // 3. Populate category <select> with defaults + any custom ones
  renderCategorySelect();

  // 4. Show budget display
  updateBudgetDisplay();

  // 5. Set default date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('txDate').value = today;

  // 6. Render UI from loaded data
  renderAll();

  // 7. Attach event listeners
  document.getElementById('transactionForm')
    .addEventListener('submit', handleFormSubmit);

  document.getElementById('addCatBtn')
    .addEventListener('click', handleAddCategory);

  // Allow pressing Enter in custom category input
  document.getElementById('customCatInput')
    .addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } });

  document.getElementById('setBudgetBtn')
    .addEventListener('click', handleSetBudget);

  document.getElementById('themeToggle')
    .addEventListener('click', handleThemeToggle);

  document.getElementById('monthFilter')
    .addEventListener('change', handleMonthFilter);

  document.getElementById('clearMonthBtn')
    .addEventListener('click', handleClearMonth);

  // Sort buttons — use event delegation on parent
  document.querySelector('.sort-row')
    .addEventListener('click', handleSort);
}

// Boot the app once DOM is ready
document.addEventListener('DOMContentLoaded', init);
