const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const releaseDir = path.join(rootDir, 'release');

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

// 1. Inline all Vite CSS and JS assets from dist/ into a single self-contained HTML file
let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

// Inline <link rel="stylesheet" ... href="./assets/...">
html = html.replace(
  /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
  (match, href) => {
    const assetPath = path.join(distDir, href.replace(/^\.\//, ''));
    if (fs.existsSync(assetPath)) {
      const css = fs.readFileSync(assetPath, 'utf8');
      return `<style>\n${css}\n</style>`;
    }
    return match;
  }
);

// Inline <script type="module" ... src="./assets/..."></script>
html = html.replace(
  /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
  (match, src) => {
    const assetPath = path.join(distDir, src.replace(/^\.\//, ''));
    if (fs.existsSync(assetPath)) {
      const js = fs.readFileSync(assetPath, 'utf8');
      // Escape any literal </script> inside JS string literals so HTML parser doesn't close early
      const safeJs = js.replace(/<\/script>/gi, '<\\/script>');
      return `<script type="module">\n${safeJs}\n</script>`;
    }
    return match;
  }
);

const standaloneHtmlPath = path.join(releaseDir, 'ZookAstro-Standalone.html');
fs.writeFileSync(standaloneHtmlPath, html, 'utf8');

// 2. GZip-compress the single-file HTML payload so the .exe is only ~315 KB!
const gzBuffer = zlib.gzipSync(Buffer.from(html, 'utf8'), { level: 9 });
const gzPath = path.join(releaseDir, 'app.html.gz');
fs.writeFileSync(gzPath, gzBuffer);

// 3. Generate native Windows C# launcher with embedded GZip payload
const csSource = `
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

namespace ZookAstroLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string appData = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "ZookAstro"
                );
                Directory.CreateDirectory(appData);
                string htmlPath = Path.Combine(appData, "ZookAstro-App.html");

                using (Stream resStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("app.html.gz"))
                using (GZipStream gz = new GZipStream(resStream, CompressionMode.Decompress))
                using (FileStream outFile = new FileStream(htmlPath, FileMode.Create, FileAccess.Write, FileShare.Read))
                {
                    gz.CopyTo(outFile);
                }

                string fileUri = new Uri(htmlPath).AbsoluteUri;
                string browserExe = FindChromiumBrowser();

                if (browserExe != null)
                {
                    string profileDir = Path.Combine(appData, "WindowProfile");
                    Directory.CreateDirectory(profileDir);
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = browserExe,
                        Arguments = string.Format(
                            "--app=\\"{0}\\" --window-size=1520,940 --user-data-dir=\\"{1}\\" --no-first-run --disable-features=Translate",
                            fileUri,
                            profileDir
                        ),
                        UseShellExecute = false
                    };
                    Process.Start(psi);
                }
                else
                {
                    Process.Start(new ProcessStartInfo(htmlPath) { UseShellExecute = true });
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to launch Zook Astro:\\n" + ex.Message, "Zook Astro", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static string FindChromiumBrowser()
        {
            string[] candidates = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\\Edge\\Application\\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\\Edge\\Application\\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\\Chrome\\Application\\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\\Chrome\\Application\\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\\Chrome\\Application\\chrome.exe")
            };
            foreach (string c in candidates)
            {
                if (!string.IsNullOrEmpty(c) && File.Exists(c))
                    return c;
            }
            return null;
        }
    }
}
`;

const csPath = path.join(releaseDir, 'ZookAstroLauncher.cs');
const exePath = path.join(releaseDir, 'ZookAstro-Lite-1.0.0.exe');
fs.writeFileSync(csPath, csSource, 'utf8');

const cscCandidates = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
];
const cscExe = cscCandidates.find((p) => fs.existsSync(p));
if (!cscExe) {
  throw new Error('Could not find built-in Windows C# compiler (csc.exe)');
}

execFileSync(
  cscExe,
  [
    '/nologo',
    '/target:winexe',
    '/optimize+',
    `/out:${exePath}`,
    `/resource:${gzPath},app.html.gz`,
    '/r:System.Windows.Forms.dll',
    csPath,
  ],
  { stdio: 'inherit' }
);

// Clean up temporary build artifacts (.cs and .gz)
try {
  fs.unlinkSync(csPath);
  fs.unlinkSync(gzPath);
} catch {}

const exeSizeKB = (fs.statSync(exePath).size / 1024).toFixed(1);
const htmlSizeKB = (fs.statSync(standaloneHtmlPath).size / 1024).toFixed(1);
console.log(`\\n✓ Built lightweight standalone executable: ${exePath} (${exeSizeKB} KB)`);
console.log(`✓ Built single-file portable HTML:        ${standaloneHtmlPath} (${htmlSizeKB} KB)`);
