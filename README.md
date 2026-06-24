# SIEN Public Website with Live Portfolio Sync

This is the main client-facing SIEN website.

It now supports dynamic project loading from Supabase. New projects uploaded through the admin portal appear in the Selected Project Portfolio section automatically.

Before deployment, update:

```text
public/supabase-config.js
```

Deploy to Vercel using:

```text
Framework Preset: Other
Build Command: npm run build
Output Directory: public
```
