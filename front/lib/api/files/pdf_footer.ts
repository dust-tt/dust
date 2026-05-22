// 16x16 inline version of public/static/landing/logos/dust/Dust_LogoSquare.svg.
// Inlined to avoid bundler-dependent __dirname / cwd path resolution across
// front (Next.js standalone) and front-api (esbuild bundle).
const logoSvg = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M36 24H24V48H36V24Z" fill="#FE9C1A"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M12 36C8.68629 36 6 33.3137 6 30C6 26.6863 8.68629 24 12 24H48V36H12Z" fill="#3B82F6"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M0 48V36H12C15.3137 36 18 38.6863 18 42C18 45.3137 15.3137 48 12 48H0Z" fill="#9FDBFF"/>
<path d="M12 24C18.6274 24 24 18.6274 24 12C24 5.37258 18.6274 0 12 0C5.37258 0 0 5.37258 0 12C0 18.6274 5.37258 24 12 24Z" fill="#E2F78C"/>
<path d="M36 24C42.6274 24 48 18.6274 48 12C48 5.37258 42.6274 0 36 0C29.3726 0 24 5.37258 24 12C24 18.6274 29.3726 24 36 24Z" fill="#FFC3DF"/>
<path d="M12 0H0V24H12V0Z" fill="#418B5C"/>
<path d="M48 0H24V12H48V0Z" fill="#E14322"/>
</svg>`;

export const PDF_FOOTER_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10px;
      color: #6B7280;
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      -webkit-print-color-adjust: exact;
    }
    .footer-content {
      display: flex;
      align-items: center;
      gap: 6px;
    }
  </style>
</head>
<body>
  <div class="footer-content">
    ${logoSvg}
    <span>Created with Dust</span>
  </div>
</body>
</html>`;
