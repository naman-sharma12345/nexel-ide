// Pinned clangd release used by packaged Nexel builds. Hashes computed from the official
// github.com/clangd/clangd/releases/tag/19.1.2 assets (GitHub publishes no digest for them).
export const CLANGD_VERSION = '19.1.2';

/** key -> release asset + where it lands under resources/clangd/. mac is a universal (x86_64+arm64) Mach-O. */
export const CLANGD_ASSETS = {
  linux: { file: `clangd-linux-${CLANGD_VERSION}.zip`, sha256: '7c09614eff857d590e4502ef516f035ff94cfb8b795de14ece5afbc53a206caf', dir: 'linux-x64', exe: 'clangd' },
  mac: { file: `clangd-mac-${CLANGD_VERSION}.zip`, sha256: 'd3b329b3f58602c57ca6501d255147af1bccad3691b1cb0c12c258fcd2da1be3', dir: 'mac-universal', exe: 'clangd' },
  win: { file: `clangd-windows-${CLANGD_VERSION}.zip`, sha256: '5b6ceb0f85d63fa0c2c9aab31c29bebd41dc11da1f160ef21bc2fea93270a20d', dir: 'win-x64', exe: 'clangd.exe' },
};

export const assetUrl = (file) => `https://github.com/clangd/clangd/releases/download/${CLANGD_VERSION}/${file}`;

/** Host platform -> asset key (linux arm64 has no official build: use a distro clangd on PATH). */
export function hostKey(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin') return 'mac';
  if (platform === 'win32') return 'win';
  if (platform === 'linux' && arch === 'x64') return 'linux';
  return null;
}
