/** @module displayFileSize */

/**
 * Format bytes into human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

/**
 * Attach file size display to dependency tree nodes.
 * @param {Object} tree - Parsed dependency tree object
 * @returns {Object} Tree with size annotations
 */
function annotateSizes(tree) {
  if (!tree || typeof tree !== 'object') return tree;

  if (tree.size !== undefined) {
    tree.sizeFormatted = formatBytes(tree.size);
  }

  if (tree.dependencies) {
    for (const name of Object.keys(tree.dependencies)) {
      tree.dependencies[name] = annotateSizes(tree.dependencies[name]);
    }
  }

  return tree;
}

module.exports = { formatBytes, annotateSizes };
