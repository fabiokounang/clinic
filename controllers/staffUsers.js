const bcrypt = require('bcryptjs');
const userModel = require('../models/user');
const auditLogModel = require('../models/audit_log');
const adminNavHelpers = require('../utils/adminNav');

const MIN_PASSWORD_LEN = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STAFF_LIST_LIMITS = [10, 25, 50, 100];
const STAFF_LIST_SORT_KEYS = new Set(['id', 'name', 'email', 'role', 'created_at']);

function normalizeStaffListLimit(raw) {
  const n = parseInt(String(raw), 10);
  return STAFF_LIST_LIMITS.includes(n) ? n : 10;
}

function normalizeStaffListSort(raw) {
  const s = String(raw || '').toLowerCase();
  return STAFF_LIST_SORT_KEYS.has(s) ? s : 'id';
}

function normalizeStaffListOrder(raw) {
  const s = String(raw || '').toLowerCase();
  return s === 'desc' ? 'desc' : 'asc';
}

function normalizeStaffRoleFilter(raw) {
  const r = String(raw || '').toLowerCase();
  return r === 'admin' || r === 'superadmin' ? r : '';
}

function normalizeStaffStatusFilter(raw) {
  const s = String(raw || '').toLowerCase();
  return s === 'active' || s === 'inactive' ? s : '';
}

function staffListQueryString(state) {
  const { search, role, status, sort, order, limit, page } = state;
  const q = new URLSearchParams();
  if (search) q.set('search', search);
  if (role) q.set('role', role);
  if (status) q.set('status', status);
  q.set('sort', sort);
  q.set('order', order);
  q.set('limit', String(limit));
  q.set('page', String(Math.max(1, page)));
  return q.toString();
}

function nextStaffListSortOrder(currentSort, currentOrder, columnKey) {
  if (currentSort === columnKey) {
    return { sort: columnKey, order: currentOrder === 'asc' ? 'desc' : 'asc' };
  }
  const ascFirst = ['name', 'email', 'role'].includes(columnKey);
  return { sort: columnKey, order: ascFirst ? 'asc' : 'desc' };
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim().slice(0, 45);
  }
  const raw = req.ip || req.connection?.remoteAddress || '';
  return String(raw).slice(0, 45) || null;
}

async function refreshSessionIfSelf(req, userId) {
  if (!req.session.admin || Number(req.session.admin.id) !== Number(userId)) return;
  const u = await userModel.getUserById(userId);
  if (u && u.is_active) {
    req.session.admin = {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role
    };
  }
}

function roleLabel(role) {
  if (role === 'superadmin') return 'Superadmin';
  return 'Admin';
}

async function index(req, res, next) {
  try {
    const search = String(req.query.search || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 200);
    const role = normalizeStaffRoleFilter(req.query.role);
    const status = normalizeStaffStatusFilter(req.query.status);
    const limit = normalizeStaffListLimit(req.query.limit);
    const sort = normalizeStaffListSort(req.query.sort);
    const order = normalizeStaffListOrder(req.query.order);

    const total = await userModel.countStaffUsers({ search, role, status });
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    let page = Math.max(parseInt(String(req.query.page), 10) || 1, 1);
    if (page > totalPages) {
      page = totalPages;
    }
    const offset = (page - 1) * limit;

    const users = await userModel.listStaffUsers({
      search,
      role,
      status,
      limit,
      offset,
      sort,
      order
    });
    const displayFrom = total === 0 ? 0 : (page - 1) * limit + 1;
    const displayTo = (page - 1) * limit + users.length;

    const hasActiveFilters = Boolean(search) || Boolean(role) || Boolean(status);
    const listState = { search, role, status, sort, order, limit, page };

    return res.render('admin/staff/index', {
      title: 'Kelola staf',
      adminNav: adminNavHelpers.staffIndex(),
      users,
      roleLabel,
      search,
      roleFilter: role,
      statusFilter: status,
      sort,
      order,
      limit,
      page,
      totalPages,
      total,
      displayFrom,
      displayTo,
      hasActiveFilters,
      staffListLimits: STAFF_LIST_LIMITS,
      staffListQs: (overrides = {}) => staffListQueryString({ ...listState, ...overrides }),
      sortColumnHref: (columnKey) => {
        const next = nextStaffListSortOrder(sort, order, columnKey);
        return `?${staffListQueryString({
          search,
          role,
          status,
          sort: next.sort,
          order: next.order,
          limit,
          page: 1
        })}`;
      }
    });
  } catch (e) {
    next(e);
  }
}

async function newForm(req, res, next) {
  try {
    return res.render('admin/staff/new', {
      title: 'Tambah staf',
      adminNav: adminNavHelpers.staffNew(),
      form: {}
    });
  } catch (e) {
    next(e);
  }
}

async function create(req, res, next) {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const password2 = String(req.body.password_confirm || '');
    const roleRaw = String(req.body.role || 'admin');

    const role = roleRaw === 'superadmin' ? 'superadmin' : 'admin';

    if (!name || name.length > 120) {
      req.flash('error_msg', 'Nama wajib diisi (maks. 120 karakter).');
      req.session.oldForm = { name, email, role };
      return res.redirect('/admin/users/new');
    }
    if (!EMAIL_RE.test(email)) {
      req.flash('error_msg', 'Format email tidak valid.');
      req.session.oldForm = { name, email, role };
      return res.redirect('/admin/users/new');
    }
    if (password.length < MIN_PASSWORD_LEN) {
      req.flash('error_msg', `Password minimal ${MIN_PASSWORD_LEN} karakter.`);
      req.session.oldForm = { name, email, role };
      return res.redirect('/admin/users/new');
    }
    if (password !== password2) {
      req.flash('error_msg', 'Konfirmasi password tidak sama.');
      req.session.oldForm = { name, email, role };
      return res.redirect('/admin/users/new');
    }

    if (await userModel.emailTaken(email)) {
      req.flash('error_msg', 'Email sudah dipakai akun lain.');
      req.session.oldForm = { name, email, role };
      return res.redirect('/admin/users/new');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const insertId = await userModel.createUser({
      name,
      email,
      passwordHash,
      role
    });

    await auditLogModel.createAuditLog({
      user_id: req.session.admin.id,
      module: 'users',
      action: 'create',
      record_id: insertId,
      description: `Buat staf: ${email} (${role})`,
      new_data: { name, email, role },
      ip_address: clientIp(req)
    });

    req.flash('success_msg', `Staf ${name} berhasil ditambahkan.`);
    return res.redirect('/admin/users');
  } catch (e) {
    next(e);
  }
}

async function editForm(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id < 1) {
      return res.status(404).render('errors/404', { title: 'Tidak ditemukan' });
    }

    const user = await userModel.getUserById(id);
    if (!user || !['admin', 'superadmin'].includes(user.role)) {
      return res.status(404).render('errors/404', { title: 'Tidak ditemukan' });
    }

    return res.render('admin/staff/edit', {
      title: 'Edit staf',
      adminNav: adminNavHelpers.staffEdit(user),
      staff: user
    });
  } catch (e) {
    next(e);
  }
}

async function update(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id < 1) {
      return res.status(404).render('errors/404', { title: 'Tidak ditemukan' });
    }

    const target = await userModel.getUserById(id);
    if (!target || !['admin', 'superadmin'].includes(target.role)) {
      return res.status(404).render('errors/404', { title: 'Tidak ditemukan' });
    }

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const password2 = String(req.body.password_confirm || '');
    const roleRaw = String(req.body.role || target.role);
    const role = roleRaw === 'superadmin' ? 'superadmin' : 'admin';
    const isActive = req.body.is_active === '1' || req.body.is_active === 'on';

    if (!name || name.length > 120) {
      req.flash('error_msg', 'Nama wajib diisi (maks. 120 karakter).');
      return res.redirect(`/admin/users/${id}/edit`);
    }
    if (!EMAIL_RE.test(email)) {
      req.flash('error_msg', 'Format email tidak valid.');
      return res.redirect(`/admin/users/${id}/edit`);
    }

    if (await userModel.emailTaken(email, id)) {
      req.flash('error_msg', 'Email sudah dipakai akun lain.');
      return res.redirect(`/admin/users/${id}/edit`);
    }

    if (id === req.session.admin.id && !isActive) {
      req.flash('error_msg', 'Anda tidak dapat menonaktifkan akun sendiri. Minta superadmin lain jika perlu.');
      return res.redirect(`/admin/users/${id}/edit`);
    }

    const superRows = await userModel.countSuperAdminRows();
    if (target.role === 'superadmin' && role === 'admin') {
      if (superRows <= 1) {
        req.flash('error_msg', 'Tidak dapat menurunkan peran: harus ada minimal satu superadmin di sistem.');
        return res.redirect(`/admin/users/${id}/edit`);
      }
    }
    if (target.role === 'superadmin' && !isActive) {
      if (superRows <= 1) {
        req.flash('error_msg', 'Tidak dapat menonaktifkan superadmin terakhir.');
        return res.redirect(`/admin/users/${id}/edit`);
      }
    }

    const payload = { name, email, role, is_active: isActive ? 1 : 0 };

    if (password.length > 0) {
      if (password.length < MIN_PASSWORD_LEN) {
        req.flash('error_msg', `Password baru minimal ${MIN_PASSWORD_LEN} karakter (kosongkan jika tidak diubah).`);
        return res.redirect(`/admin/users/${id}/edit`);
      }
      if (password !== password2) {
        req.flash('error_msg', 'Konfirmasi password tidak sama.');
        return res.redirect(`/admin/users/${id}/edit`);
      }
      payload.passwordHash = await bcrypt.hash(password, 12);
    }

    const oldSnap = {
      name: target.name,
      email: target.email,
      role: target.role,
      is_active: target.is_active
    };

    await userModel.updateUser(id, payload);

    await auditLogModel.createAuditLog({
      user_id: req.session.admin.id,
      module: 'users',
      action: 'update',
      record_id: id,
      description: `Ubah staf: ${email}`,
      old_data: oldSnap,
      new_data: {
        name,
        email,
        role,
        is_active: isActive
      },
      ip_address: clientIp(req)
    });

    await refreshSessionIfSelf(req, id);

    req.flash('success_msg', 'Data staf diperbarui.');
    return res.redirect('/admin/users');
  } catch (e) {
    next(e);
  }
}

async function destroy(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id < 1) {
      return res.status(404).render('errors/404', { title: 'Tidak ditemukan' });
    }

    if (id === req.session.admin.id) {
      req.flash('error_msg', 'Anda tidak dapat menghapus akun yang sedang dipakai login.');
      return res.redirect('/admin/users');
    }

    const target = await userModel.getUserById(id);
    if (!target) {
      req.flash('error_msg', 'Pengguna tidak ditemukan.');
      return res.redirect('/admin/users');
    }

    if (target.role === 'superadmin') {
      const superRows = await userModel.countSuperAdminRows();
      if (superRows <= 1) {
        req.flash('error_msg', 'Tidak dapat menghapus superadmin terakhir.');
        return res.redirect('/admin/users');
      }
    }

    const ok = await userModel.deleteUserById(id);
    if (!ok) {
      req.flash('error_msg', 'Gagal menghapus pengguna.');
      return res.redirect('/admin/users');
    }

    await auditLogModel.createAuditLog({
      user_id: req.session.admin.id,
      module: 'users',
      action: 'delete',
      record_id: id,
      description: `Hapus staf id ${id} (${target.email})`,
      old_data: { email: target.email, role: target.role },
      ip_address: clientIp(req)
    });

    req.flash('success_msg', 'Akun staf dihapus.');
    return res.redirect('/admin/users');
  } catch (e) {
    next(e);
  }
}

module.exports = {
  index,
  newForm,
  create,
  editForm,
  update,
  destroy
};
