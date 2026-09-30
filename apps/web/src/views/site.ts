export const BUILD_GAMES = 'https://canivibecodeit.com/thebuildgames';
export const SITE = 'https://excerpt-rho.vercel.app';
export const SOURCE = 'https://github.com/treycodex/excerpt';
/** Always the newest release's disk image; the file keeps one name across releases. */
export const DOWNLOAD = `${SOURCE}/releases/latest/download/Excerpt.dmg`;
export const REQUIRES = 'macOS 26 or later on Apple silicon';

/** Served from apps/web/public, as plain text so a browser shows it instead of saving it. */
export const INSTALL_SCRIPT = `${SITE}/install.sh`;
export const INSTALL_COMMAND = `curl -fsSL ${INSTALL_SCRIPT} | sh`;
export const UNQUARANTINE_COMMAND = 'xattr -dr com.apple.quarantine /Applications/Excerpt.app';
