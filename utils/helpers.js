function generatePatientCode(id) {
  return `PT-${String(id).padStart(6, '0')}`;
}

function normalizeCheckbox(value) {
  return value ? 1 : 0;
}

module.exports = {
  generatePatientCode,
  normalizeCheckbox
};