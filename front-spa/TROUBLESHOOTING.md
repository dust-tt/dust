# front-spa Troubleshooting

## "Failed to fetch dynamically imported module" / 504 Outdated Optimize Dep

**Symptoms:**
- Browser console shows `Failed to fetch dynamically imported module: http://localhost:.../<SomePage>.tsx`
- Network tab shows `504 (Outdated Optimize Dep)` on a `.js` file under `node_modules/.vite/deps/`
- React Router displays "Unexpected Application Error!"

**Cause:**
Vite's dependency optimizer cache has gone stale (after a restart, dependency change, or git operation). The browser still has cached JS chunks referencing old dependency hashes, and Vite returns 504 for those.

**Fix:**
1. Restart the SPA Vite dev server (not the Next.js `front` service):
   - With dust-hive: `dust-hive restart <env-name> front-spa-app`
   - Without dust-hive: kill and re-run the Vite dev server process for front-spa
2. Hard refresh the browser: **Cmd+Shift+R**

**Note:** This is a dev-only issue. Production builds use static assets with stable hashes.
