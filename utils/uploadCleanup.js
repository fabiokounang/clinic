const fs = require('fs').promises;
const path = require('path');

async function unlinkAbsolute(absPaths) {
  for (const abs of absPaths || []) {
    if (!abs || typeof abs !== 'string') continue;
    try {
      await fs.unlink(abs);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('unlinkAbsolute:', e.message);
      }
    }
  }
}

async function unlinkPublicRelative(relPaths) {
  const base = path.join(__dirname, '../public');
  for (const rel of relPaths || []) {
    if (!rel || typeof rel !== 'string' || !rel.startsWith('/uploads/clinical/')) continue;
    const abs = path.join(base, rel.replace(/^\//, ''));
    try {
      await fs.unlink(abs);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('unlinkPublicRelative:', e.message);
      }
    }
  }
}

module.exports = {
  unlinkAbsolute,
  unlinkPublicRelative
};
