const formTypeModel = require('../models/form_type');
const { getSiteBaseUrl } = require('../utils/request');

async function redirectRootToLogin(req, res) {
  return res.redirect('/admin/auth/login');
}

async function formSelector(req, res) {
  const formTypes = await formTypeModel.getActiveFormTypes();
  const siteBaseUrl = getSiteBaseUrl(req);
  const appName = res.locals.appName || 'Klinik';

  const formCards = formTypes.map((item) => {
    const infoUrl = `${siteBaseUrl}/p/${item.slug}`;
    const waBody = `Halo,\n\nBerikut informasi layanan ${item.name} dari ${appName}:\n\n${infoUrl}\n\nRekam medis diurus oleh tim klinik. Terima kasih.`;
    return {
      ...item,
      infoUrl,
      waHref: `https://wa.me/?text=${encodeURIComponent(waBody)}`
    };
  });

  return res.render('site/forms', {
    title: 'Tautan informasi untuk pasien',
    formCards,
    hubMode: true
  });
}

async function showPatientInfo(req, res) {
  const { formType } = req.params;
  const formTypeData = await formTypeModel.getFormTypeBySlug(formType);

  if (!formTypeData) {
    return res.status(404).render('errors/404', {
      title: 'Halaman tidak ditemukan'
    });
  }

  const siteBaseUrl = getSiteBaseUrl(req);
  const infoPath = `/p/${formTypeData.slug}`;
  const appName = res.locals.appName || 'Klinik';

  return res.render('site/patient_info', {
    title: `${formTypeData.name} · ${appName}`,
    formTypeData,
    appName,
    infoAbsoluteUrl: `${siteBaseUrl}${infoPath}`
  });
}

/** Pengalihan permanen dari URL lama /form/... ke /p/... */
function redirectLegacyForm(req, res) {
  const { formType } = req.params;
  return res.redirect(301, `/p/${encodeURIComponent(formType)}`);
}

module.exports = {
  redirectRootToLogin,
  formSelector,
  showPatientInfo,
  redirectLegacyForm
};
