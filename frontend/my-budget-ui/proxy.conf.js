/**
 * Same-origin proxy for Keycloak during `ng serve`. Override target with MYBUDGET_KEYCLOAK_ORIGIN.
 */
const target = (process.env.MYBUDGET_KEYCLOAK_ORIGIN || 'https://auth.ispark.diskstation.me').replace(
  /\/$/,
  ''
);

module.exports = {
  '/kc': {
    target,
    secure: true,
    changeOrigin: true,
    pathRewrite: { '^/kc': '' },
    logLevel: 'silent'
  },
  '/resources': {
    target,
    secure: true,
    changeOrigin: true,
    logLevel: 'silent'
  }
};
